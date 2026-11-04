import { serverMsgSchema, type ClientMsg, type ServerMsg } from '@snake/shared';
import WebSocket, { type RawData } from 'ws';

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}

function isOfType<T extends ServerMsg['type']>(msg: ServerMsg, type: T): msg is Extract<ServerMsg, { type: T }> {
  return msg.type === type;
}

/** A real WebSocket client for integration tests: validates what it receives and lets tests wait for messages. */
export class TestSocket {
  readonly messages: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: Array<() => void> = [];
  private consumed = 0;
  private readonly ws: WebSocket;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(url, { headers });
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      this.messages.push(serverMsgSchema.parse(JSON.parse(rawText(data))));
      this.wake();
    });
    this.ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.wake();
    });
    this.ws.on('error', () => undefined);
  }

  private wake(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const wake of waiting) wake();
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.once('open', () => {
        resolve();
      });
      this.ws.once('unexpected-response', (_req, res) => {
        reject(new Error(`HTTP ${String(res.statusCode)}`));
      });
      this.ws.once('error', (error) => {
        reject(error);
      });
    });
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(data: string | Buffer, binary = false): void {
    this.ws.send(data, { binary });
  }

  /** Resolves with the next unread message of `type` (that also satisfies `accept`); other messages are skipped. */
  async next<T extends ServerMsg['type']>(
    type: T,
    timeoutMs = 3000,
    accept: (msg: Extract<ServerMsg, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMsg, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.consumed < this.messages.length) {
        const msg = this.messages[this.consumed++];
        if (msg && isOfType(msg, type) && accept(msg)) return msg;
      }
      if (this.closed) throw new Error(`socket closed (${String(this.closed.code)}) while waiting for ${type}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, left).unref();
      });
    }
  }

  async whenClosed(timeoutMs = 3000): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('socket did not close in time');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, left).unref();
      });
    }
    return this.closed;
  }

  close(): void {
    this.ws.close();
  }
}
