import type { SocketLike } from './gameSocket';

/** Wraps the browser's WebSocket in the small interface GameSocket uses, so tests can stand in for it. */
export function browserSocket(url: string, Socket: typeof WebSocket = WebSocket): SocketLike {
  const ws = new Socket(url);
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
  ws.onopen = () => like.onopen?.();
  ws.onmessage = (event) => like.onmessage?.({ data: event.data });
  ws.onclose = (event) => like.onclose?.({ code: event.code });
  ws.onerror = () => like.onerror?.();
  return like;
}
