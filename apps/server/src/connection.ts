import type { ServerMsg } from '@snake/shared';

/** The server's view of one client socket. The WebSocket adapter and the test fakes both implement it. */
export interface Connection {
  readonly id: string;
  readonly ip: string;
  isOpen: () => boolean;
  /** Sends text that is already serialised (so one snapshot is encoded once for a whole room). */
  sendText: (text: string) => void;
  close: (code: number, reason: string) => void;
}

export function encode(msg: ServerMsg): string {
  return JSON.stringify(msg);
}

export function send(conn: Connection | null, msg: ServerMsg): void {
  if (conn?.isOpen()) conn.sendText(encode(msg));
}
