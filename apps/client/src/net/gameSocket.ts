import { PROTOCOL_VERSION, serverMsgSchema, type ClientMsg, type ServerMsg } from '@snake/shared';
import { createStore, type Store } from '../state/store';
import { browserSocket } from './browserSocket';
import { ClockSync } from './clockSync';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'failed' | 'closed';

/** The slice of the browser WebSocket this module needs, so tests can supply a fake. */
export interface SocketLike {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface SocketStatus {
  state: ConnectionState;
  /** Consecutive failed attempts while reconnecting. */
  attempt: number;
  /** Milliseconds until the next reconnect attempt, for the "retrying in" message. */
  retryInMs: number | null;
}

export interface GameSocketOptions {
  url: string;
  nick: () => string;
  guestId: string;
  factory?: SocketFactory;
  now?: () => number;
  random?: () => number;
  maxAttempts?: number;
}

const PING_EVERY_MS = 2000;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/** Close codes after which retrying cannot help: the server replaced us, or refused our protocol version. */
const FINAL_CLOSE_CODES = new Set([1008, 4001]);

/**
 * One logical connection to the server. It reconnects with exponential backoff, presents the resume
 * token so a dropped player gets their seat back, keeps the server clock estimate fresh and hands
 * validated messages to listeners. Messages sent while offline are refused, never queued: an old
 * steering input arriving late would be worse than none.
 */
export class GameSocket {
  readonly status: Store<SocketStatus> = createStore<SocketStatus>({ state: 'closed', attempt: 0, retryInMs: null });
  readonly clock = new ClockSync();
  private readonly listeners = new Set<(msg: ServerMsg) => void>();
  private socket: SocketLike | null = null;
  private resume: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionallyClosed = false;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly factory: SocketFactory;

  constructor(private readonly options: GameSocketOptions) {
    this.now = options.now ?? ((): number => performance.now());
    this.random = options.random ?? Math.random;
    this.factory = options.factory ?? ((url): SocketLike => browserSocket(url));
  }

  onMessage(listener: (msg: ServerMsg) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    if (this.socket) return;
    this.intentionallyClosed = false;
    this.open(this.status.get().attempt > 0 ? 'reconnecting' : 'connecting');
  }

  /** Tries again right now, for the "Retry" button and for when the browser reports it is back online. */
  retryNow(): void {
    if (this.status.get().state === 'open' || this.status.get().state === 'connecting') return;
    this.clearRetry();
    this.status.update((s) => ({ ...s, attempt: 0 }));
    this.connect();
  }

  send(msg: ClientMsg): boolean {
    if (this.status.get().state !== 'open' || !this.socket) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.intentionallyClosed = true;
    this.clearRetry();
    this.stopPing();
    this.socket?.close(1000, 'leaving');
    this.socket = null;
    this.status.set({ state: 'closed', attempt: 0, retryInMs: null });
  }

  private open(state: ConnectionState): void {
    this.status.update((s) => ({ ...s, state, retryInMs: null }));
    const socket = this.factory(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      this.sendRaw({
        type: 'hello',
        v: PROTOCOL_VERSION,
        nick: this.options.nick(),
        guestId: this.options.guestId,
        ...(this.resume ? { resume: this.resume } : {}),
      });
    };
    socket.onmessage = (event) => {
      this.receive(event.data);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.lost(event.code);
    };
    socket.onerror = () => undefined;
  }

  private sendRaw(msg: ClientMsg): void {
    this.socket?.send(JSON.stringify(msg));
  }

  private receive(data: unknown): void {
    const parsed = typeof data === 'string' ? safeParse(data) : null;
    if (!parsed) return;
    if (parsed.type === 'welcome') this.onWelcome(parsed.resume);
    else if (parsed.type === 'pong') this.clock.record(parsed.t, this.now(), parsed.st);
    for (const listener of this.listeners) listener(parsed);
  }

  private onWelcome(resume: string): void {
    this.resume = resume;
    this.status.set({ state: 'open', attempt: 0, retryInMs: null });
    this.startPing();
  }

  private startPing(): void {
    this.stopPing();
    const ping = (): void => {
      this.sendRaw({ type: 'ping', t: this.now() });
    };
    ping();
    this.pingTimer = setInterval(ping, PING_EVERY_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private lost(code: number): void {
    this.stopPing();
    this.socket = null;
    if (this.intentionallyClosed || FINAL_CLOSE_CODES.has(code)) {
      this.status.set({ state: 'closed', attempt: 0, retryInMs: null });
      return;
    }
    const attempt = this.status.get().attempt + 1;
    if (attempt > (this.options.maxAttempts ?? 12)) {
      this.status.set({ state: 'failed', attempt, retryInMs: null });
      return;
    }
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1)) * (0.5 + this.random() * 0.5);
    this.status.set({ state: 'reconnecting', attempt, retryInMs: Math.round(delay) });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

function safeParse(text: string): ServerMsg | null {
  try {
    const result = serverMsgSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
