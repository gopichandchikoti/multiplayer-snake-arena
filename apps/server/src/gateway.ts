import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Clock } from './clock';
import type { ServerConfig } from './config';
import { type Connection, send } from './connection';
import type { Logger } from './logger';
import { parseClientMessage } from './parse';
import { type IpLimiter, isOriginAllowed } from './security';
import { Session, type SessionDeps } from './session';
import type { Stats } from './stats';

export interface GatewayDeps {
  config: ServerConfig;
  session: SessionDeps;
  limiter: IpLimiter;
  stats: Stats;
  log: Logger;
  clock: Clock;
}

const MAX_PAYLOAD = 2048;
const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 10_000;
const VIOLATION_WINDOW_MS = 10_000;
const MAX_VIOLATIONS = 60;
/** A client this far behind is stalled; snapshots are replaceable, so we skip rather than queue them. */
const SKIP_BUFFERED = 256 * 1024;
const DROP_BUFFERED = 4 * 1024 * 1024;

class WsConnection implements Connection {
  constructor(
    private readonly ws: WebSocket,
    readonly id: string,
    readonly ip: string,
  ) {}

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  sendText(text: string): void {
    if (this.ws.bufferedAmount > DROP_BUFFERED) this.ws.terminate();
    else if (this.ws.bufferedAmount <= SKIP_BUFFERED) this.ws.send(text);
  }

  close(code: number, reason: string): void {
    this.ws.close(code, reason);
  }
}

export function clientAddress(
  req: Pick<IncomingMessage, 'headers'> & { socket: { remoteAddress?: string | undefined } },
  trustProxy: boolean,
): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;
  return (trustProxy && first ? first : req.socket.remoteAddress) ?? 'unknown';
}

function rawToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}

function refuse(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export interface Gateway {
  close: () => Promise<void>;
}

/** Why an upgrade request was turned away, or null when it may proceed. */
function admission(req: IncomingMessage, ip: string, deps: GatewayDeps): string | null {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path !== '/ws') return '404 Not Found';
  if (!isOriginAllowed(req.headers.origin, req.headers.host, deps.config)) {
    deps.log.warn('ws_origin_refused', { origin: req.headers.origin ?? null, ip });
    return '403 Forbidden';
  }
  if (!deps.limiter.acquire(ip)) {
    deps.log.warn('ws_ip_limit', { ip });
    return '429 Too Many Requests';
  }
  return null;
}

/** Counts bad or excessive messages over a sliding window and hangs up on a client that keeps at it. */
function violationCounter(ws: WebSocket, deps: GatewayDeps, ip: string): () => void {
  let window = { start: deps.clock.now(), count: 0 };
  return () => {
    const now = deps.clock.now();
    if (now - window.start > VIOLATION_WINDOW_MS) window = { start: now, count: 0 };
    window.count += 1;
    if (window.count > MAX_VIOLATIONS) {
      deps.log.warn('ws_violations_closed', { ip });
      ws.close(1008, 'too many invalid or excessive messages');
    }
  };
}

function accept(ws: WebSocket, ip: string, deps: GatewayDeps, alive: WeakMap<WebSocket, boolean>): void {
  const conn = new WsConnection(ws, randomBytes(6).toString('hex'), ip);
  const session = new Session(conn, deps.session);
  deps.stats.counters.connectionsOpened += 1;
  alive.set(ws, true);
  const hello = deps.clock.after(HELLO_TIMEOUT_MS, () => {
    if (!session.hasPlayer) ws.close(4000, 'hello timeout');
  });
  const violation = violationCounter(ws, deps, ip);
  ws.on('pong', () => {
    alive.set(ws, true);
  });
  ws.on('message', (data, isBinary) => {
    onMessage({ ws, session, deps, data, isBinary, violation });
  });
  ws.on('error', (error) => {
    deps.log.debug('ws_error', { conn: conn.id, message: error.message });
  });
  ws.on('close', () => {
    hello.cancel();
    session.closed();
    deps.limiter.release(ip);
    deps.stats.counters.connectionsClosed += 1;
  });
}

/** Accepts WebSocket upgrades on `/ws` and wires each socket to a Session, with all the abuse limits. */
export function attachGateway(server: Server, deps: GatewayDeps): Gateway {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req, socket, head) => {
    const ip = clientAddress(req, deps.config.trustProxy);
    const refusal = admission(req, ip, deps);
    if (refusal) {
      if (!refusal.startsWith('404')) deps.stats.counters.connectionsRejected += 1;
      refuse(socket, refusal);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      accept(ws, ip, deps, alive);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) {
          send(new WsConnection(ws, 'shutdown', ''), { type: 'bye', reason: 'server_shutdown' });
          ws.close(1001, 'server shutting down');
        }
        wss.close(() => {
          resolve();
        });
      }),
  };
}

interface MessageContext {
  ws: WebSocket;
  session: Session;
  deps: GatewayDeps;
  data: RawData;
  isBinary: boolean;
  violation: () => void;
}

function onMessage({ ws, session, deps, data, isBinary, violation }: MessageContext): void {
  deps.stats.counters.messagesIn += 1;
  if (isBinary) {
    ws.close(1003, 'text frames only');
    return;
  }
  const parsed = parseClientMessage(rawToText(data));
  if (!parsed.ok) {
    deps.stats.counters.badMessages += 1;
    session.fail(parsed.code);
    if (parsed.code === 'unsupported_version') ws.close(1008, 'unsupported protocol version');
    else violation();
    return;
  }
  if (!session.handle(parsed.msg)) violation();
}
