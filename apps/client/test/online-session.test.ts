import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, snapshotFromWorld, type RoomView, type ServerMsg } from '@snake/shared';
import { browserSocket } from '../src/net/browserSocket';
import { inviteFromSearch, inviteLink, socketUrl } from '../src/net/createOnline';
import { GameSocket } from '../src/net/gameSocket';
import { OnlineSession } from '../src/net/onlineSession';
import { FakeSocket } from './fakeSocket';

const ROOM: RoomView = {
  code: 'ABCDE',
  phase: 'lobby',
  visibility: 'private',
  theme: 'parchment',
  hostId: 'me',
  players: [
    { id: 'me', nick: 'Ada', slot: 0, ready: false, connected: true, role: 'player' },
    { id: 'bo', nick: 'Bo', slot: 1, ready: false, connected: true, role: 'player' },
  ],
  countdownEndsAt: null,
  matchStartedAt: null,
  maxPlayers: 8,
};

let sockets: FakeSocket[] = [];

function start(options: { autoJoin?: string } = {}) {
  sockets = [];
  const socket = new GameSocket({
    url: 'ws://t/ws',
    nick: () => 'Ada',
    guestId: 'guest-12345678',
    factory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    now: () => 1000,
    random: () => 1,
  });
  const session = new OnlineSession(socket, options);
  session.connect();
  const raw = sockets[0];
  raw?.open();
  const say = (msg: ServerMsg): void => raw?.say(msg);
  say({ type: 'welcome', playerId: 'me', nick: 'Ada', resume: 'R'.repeat(32), serverTime: 5000, resumed: false });
  return { session, socket, raw, say };
}

const snapshot = (tick = 0) => {
  const world = createWorld({ seed: 1, slots: [0, 1] });
  return snapshotFromWorld(world, 5000 + tick * 66, new Map(), []);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('OnlineSession', () => {
  it('learns who I am from the greeting and mirrors the connection', () => {
    const { session } = start();
    expect(session.state.get()).toMatchObject({
      me: { id: 'me', nick: 'Ada' },
      connection: { state: 'open' },
      room: null,
      game: null,
    });
  });

  it('sends the right message for each action', () => {
    const { session, raw } = start();
    session.quickplay();
    session.createRoom('public', 'kiln');
    session.joinRoom(' abcde ', true);
    session.setReady(true);
    session.setTheme('tidepool');
    const types = raw?.sent.slice(2);
    expect(types).toEqual([
      { type: 'quickplay' },
      { type: 'create_room', visibility: 'public', theme: 'kiln' },
      { type: 'join_room', code: 'ABCDE', spectate: true },
      { type: 'ready', ready: true },
      { type: 'set_theme', theme: 'tidepool' },
    ]);
  });

  it('says so, instead of pretending, when an action cannot be sent', () => {
    const { session, raw } = start();
    raw?.drop(1006);
    session.quickplay();
    expect(session.state.get().notice?.message).toMatch(/offline/i);
    session.clearNotice();
    expect(session.state.get().notice).toBeNull();
  });

  it('tracks the room and shows server errors as notices', () => {
    const { session, say } = start();
    say({ type: 'room', room: ROOM });
    expect(session.state.get().room?.code).toBe('ABCDE');
    say({ type: 'error', code: 'room_full', message: 'That room is full.' });
    expect(session.state.get().notice).toEqual({ code: 'room_full', message: 'That room is full.' });
    say({ type: 'pong', t: 1, st: 2 });
  });

  it('starts a match on the first snapshot, drops it on the lobby, and ignores snapshots without a room', () => {
    const { session, say } = start();
    say(snapshot());
    expect(session.state.get().game).toBeNull();
    say({ type: 'room', room: { ...ROOM, phase: 'countdown' } });
    say(snapshot());
    const game = session.state.get().game;
    expect(game).not.toBeNull();
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    say(snapshot(1));
    expect(session.state.get().game).toBe(game);
    say({ type: 'room', room: { ...ROOM, phase: 'lobby' } });
    expect(session.state.get().game).toBeNull();
  });

  it('keeps the round result for the summary and clears it when the lobby opens again', () => {
    const { session, say } = start();
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    say(snapshot());
    say({
      type: 'round_end',
      reason: 'timer',
      endedAtTick: 30,
      winnerSlots: [0],
      standings: [{ slot: 0, rank: 1, score: 10, kills: 0, length: 4, alive: true }],
      names: { '0': 'Ada' },
      ranked: true,
    });
    say({ type: 'room', room: { ...ROOM, phase: 'summary' } });
    expect(session.state.get().result?.winnerSlots).toEqual([0]);
    expect(session.state.get().game?.hud().phase).toBe('ended');
    say({ type: 'room', room: { ...ROOM, phase: 'lobby' } });
    expect(session.state.get()).toMatchObject({ result: null, game: null });
  });

  it('leaves at once on the client, tells the server, and ignores late snapshots', () => {
    const { session, say, raw } = start();
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    say(snapshot());
    session.leave();
    expect(raw?.sent.at(-1)).toEqual({ type: 'leave_room' });
    expect(session.state.get()).toMatchObject({ room: null, game: null });
    say(snapshot(2));
    expect(session.state.get().game).toBeNull();
  });

  it('joins an invited room once, only on a fresh greeting', () => {
    const { raw } = start({ autoJoin: 'ABCDE' });
    expect(raw?.sent.filter((m) => JSON.stringify(m).includes('join_room'))).toEqual([
      { type: 'join_room', code: 'ABCDE', spectate: false },
    ]);
    raw?.say({
      type: 'welcome',
      playerId: 'me',
      nick: 'Ada',
      resume: 'R'.repeat(32),
      serverTime: 5000,
      resumed: false,
    });
    expect(raw?.sent.filter((m) => JSON.stringify(m).includes('join_room'))).toHaveLength(1);
  });

  it('does not rejoin an invite after resuming a dropped connection', () => {
    const { raw } = start();
    raw?.say({ type: 'welcome', playerId: 'me', nick: 'Ada', resume: 'R'.repeat(32), serverTime: 5000, resumed: true });
    expect(raw?.sent.some((m) => JSON.stringify(m).includes('join_room'))).toBe(false);
  });

  it('resets the match state when the connection is resumed, and notes a replaced session', () => {
    const { session, say } = start();
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    say(snapshot());
    const game = session.state.get().game;
    if (!game) throw new Error('expected a running match');
    const reset = vi.spyOn(game, 'onReconnected');
    say({ type: 'welcome', playerId: 'me', nick: 'Ada', resume: 'R'.repeat(32), serverTime: 5000, resumed: true });
    expect(reset).toHaveBeenCalled();
    say({ type: 'bye', reason: 'replaced' });
    expect(session.state.get().farewell).toBe('replaced');
  });

  it('closes the socket and stops listening when disposed', () => {
    const { session, raw, say } = start();
    session.dispose();
    expect(raw?.closedWith).toBe(1000);
    say({ type: 'room', room: ROOM });
    expect(session.state.get().room).toBeNull();
  });

  it('passes input from the match through the socket', () => {
    const { session, say, raw } = start();
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    say(snapshot());
    session.state.get().game?.turn(2);
    expect(raw?.sent.at(-1)).toEqual({ type: 'input', seq: 1, dir: 2 });
  });
});

describe('invite links and socket URL', () => {
  it('reads a valid room code from the address bar', () => {
    expect(inviteFromSearch('?room=abcde')).toBe('ABCDE');
    expect(inviteFromSearch('?x=1&room=Z9Z9Z')).toBe('Z9Z9Z');
    for (const bad of ['', '?room=abc', '?room=ABCDEF', '?room=AB<DE', '?other=ABCDE']) {
      expect(inviteFromSearch(bad)).toBeNull();
    }
  });

  it('builds invite links and picks ws or wss to match the page', () => {
    expect(inviteLink({ origin: 'https://play.example', pathname: '/' }, 'ABCDE')).toBe(
      'https://play.example/?room=ABCDE',
    );
    expect(socketUrl({ protocol: 'http:', host: 'localhost:5722' })).toBe('ws://localhost:5722/ws');
    expect(socketUrl({ protocol: 'https:', host: 'play.example' })).toBe('wss://play.example/ws');
  });
});

describe('browserSocket', () => {
  class FakeWebSocket {
    static last: FakeWebSocket | null = null;
    sent: string[] = [];
    closed: Array<number | undefined> = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      FakeWebSocket.last = this;
    }
    send(data: string): void {
      this.sent.push(data);
    }
    close(code?: number): void {
      this.closed.push(code);
    }
  }

  it('passes sends, closes and events through to the browser socket', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const like = browserSocket('ws://x/ws');
    const ws = FakeWebSocket.last;
    const events: string[] = [];
    like.onopen = () => events.push('open');
    like.onmessage = (e) => events.push(`msg:${String(e.data)}`);
    like.onclose = (e) => events.push(`close:${e.code}`);
    like.onerror = () => events.push('error');
    ws?.onopen?.();
    ws?.onmessage?.({ data: 'hi' });
    ws?.onclose?.({ code: 1006 });
    ws?.onerror?.();
    like.send('payload');
    like.close(1000, 'bye');
    expect(events).toEqual(['open', 'msg:hi', 'close:1006', 'error']);
    expect(ws?.sent).toEqual(['payload']);
    expect(ws?.closed).toEqual([1000]);
    expect(ws?.url).toBe('ws://x/ws');
    vi.unstubAllGlobals();
  });
});
