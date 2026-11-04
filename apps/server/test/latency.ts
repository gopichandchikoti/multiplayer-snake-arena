import { connect, createServer, type Server, type Socket } from 'node:net';
import WebSocket, { type RawData } from 'ws';
import type { SocketLike } from '../../client/src/net/gameSocket';

export interface ProxyOptions {
  /** One-way delay added to every chunk, in each direction. */
  delayMs: number;
  /** Random extra delay, up to this many ms, per chunk. Order is always preserved (it is TCP). */
  jitterMs: number;
}

/**
 * A TCP proxy that makes a local connection behave like a distant one. WebSocket rides on TCP, so true
 * packet loss shows up to an application as a stall (retransmission) or a dead connection: `stall` and
 * `cut` model those two cases.
 */
export class LatencyProxy {
  private readonly sockets = new Set<Socket>();
  private holdUntil = 0;

  private constructor(
    private readonly server: Server,
    readonly port: number,
    private options: ProxyOptions,
  ) {}

  static async start(targetPort: number, options: ProxyOptions): Promise<LatencyProxy> {
    let proxy: LatencyProxy | null = null;
    const server = createServer((client) => {
      const upstream = connect(targetPort, '127.0.0.1');
      proxy?.track(client, upstream);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('proxy has no port');
    proxy = new LatencyProxy(server, address.port, options);
    return proxy;
  }

  setDelay(options: ProxyOptions): void {
    this.options = options;
  }

  /** Holds everything for `ms`, then releases it in order, like a burst of lost packets being retransmitted. */
  stall(ms: number): void {
    this.holdUntil = Date.now() + ms;
  }

  /** Kills every connection through the proxy, as a dropped mobile signal would. */
  cut(): void {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  async close(): Promise<void> {
    this.cut();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private track(a: Socket, b: Socket): void {
    for (const socket of [a, b]) {
      this.sockets.add(socket);
      socket.on('error', () => undefined);
      socket.on('close', () => {
        this.sockets.delete(socket);
      });
    }
    this.pipe(a, b);
    this.pipe(b, a);
  }

  private pipe(from: Socket, to: Socket): void {
    let last = 0;
    from.on('data', (chunk) => {
      const jitter = Math.random() * this.options.jitterMs;
      const at = Math.max(last, Date.now() + this.options.delayMs + jitter, this.holdUntil);
      last = at;
      setTimeout(
        () => {
          if (!to.destroyed) to.write(chunk);
        },
        Math.max(0, at - Date.now()),
      );
    });
    from.on('close', () => {
      setTimeout(() => {
        to.destroy();
      }, this.options.delayMs);
    });
  }
}

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}

/** The client's GameSocket talks to this in tests instead of a browser WebSocket. */
export function nodeSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const like: SocketLike = {
    send: (data) => {
      ws.send(data);
    },
    close: (code, reason) => {
      ws.close(code, reason);
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.on('open', () => like.onopen?.());
  ws.on('message', (data, isBinary) => like.onmessage?.({ data: isBinary ? data : rawText(data) }));
  ws.on('close', (code) => like.onclose?.({ code }));
  ws.on('error', () => like.onerror?.());
  return like;
}

export async function waitFor(check: () => boolean, timeoutMs = 10_000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
