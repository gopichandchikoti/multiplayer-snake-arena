import { GameSocket } from './gameSocket';
import { OnlineSession } from './onlineSession';

/** The WebSocket endpoint of whatever server delivered this page (the Vite dev server proxies /ws). */
export function socketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** A room code from an invite link such as `?room=ABCDE`, or null when absent or malformed. */
export function inviteFromSearch(search: string): string | null {
  const code = new URLSearchParams(search).get('room');
  return code !== null && /^[A-Za-z0-9]{5}$/.test(code) ? code.toUpperCase() : null;
}

export function inviteLink(location: Pick<Location, 'origin' | 'pathname'>, code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

export function createOnlineSession(nick: () => string, guestId: string, invite: string | null): OnlineSession {
  const socket = new GameSocket({ url: socketUrl(window.location), nick, guestId });
  const session = new OnlineSession(socket, invite ? { autoJoin: invite } : {});
  session.connect();
  return session;
}
