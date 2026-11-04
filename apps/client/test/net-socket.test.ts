import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockSync, lagLevel } from '../src/net/clockSync';
import { GameSocket } from '../src/net/gameSocket';
import { FakeSocket } from './fakeSocket';

describe('ClockSync', () => {
  it('estimates the server clock from the quickest round trip', () => {
    const sync = new ClockSync();
    expect(sync.ready).toBe(false);
    expect(sync.info()).toBeNull();
    sync.record(1000, 1200, 5100); // rtt 200, offset 5100 + 100 - 1200 = 4000
    sync.record(2000, 2040, 6020 + 0); // rtt 40, offset 6020 + 20 - 2040 = 4000
    sync.record(3000, 3400, 7300); // slow: rtt 400, offset 7300 + 200 - 3400 = 4100
    expect(sync.offset).toBe(4000);
    expect(sync.serverNow(10_000)).toBe(14_000);
    expect(sync.clientTime(14_000)).toBe(10_000);
    expect(sync.ready).toBe(true);
  });

  it('smooths round-trip time and reports jitter and a quality level', () => {
    const sync = new ClockSync();
    sync.record(0, 50, 0);
    expect(sync.rtt).toBe(50);
    sync.record(100, 250, 0);
    expect(sync.rtt).toBeCloseTo(70);
    expect(sync.jitter).toBeCloseTo(20);
    expect(sync.info()).toEqual({ rtt: 70, jitter: 20, level: 'good' });
  });

  it.each([
    [10, 'good'],
    [79, 'good'],
    [80, 'fair'],
    [159, 'fair'],
    [160, 'poor'],
    [299, 'poor'],
    [300, 'bad'],
    [2000, 'bad'],
  ] as const)('rates %d ms as %s', (rtt, level) => {
    expect(lagLevel(rtt)).toBe(level);
  });

  it('ignores impossible samples and can be reset', () => {
    const sync = new ClockSync();
    sync.record(100, 50, 0);
    sync.record(0, 99_999, 0);
    sync.record(0, Number.NaN, 0);
    sync.record(0, 10, Number.POSITIVE_INFINITY);
    expect(sync.ready).toBe(false);
    expect(sync.offset).toBe(0);
    sync.record(0, 10, 100);
    sync.reset();
    expect(sync.ready).toBe(false);
    expect(sync.rtt).toBe(0);
  });
});

describe('GameSocket', () => {
  let sockets: FakeSocket[];
  let nowValue: number;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    nowValue = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (extra: Partial<ConstructorParameters<typeof GameSocket>[0]> = {}) =>
    new GameSocket({
      url: 'ws://test/ws',
      nick: () => 'Ada',
      guestId: 'guest-12345678',
      factory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => nowValue,
      random: () => 1,
      ...extra,
    });

  const welcome = (resume = 'R'.repeat(32)) => ({
    type: 'welcome',
    playerId: 'p1',
    nick: 'Ada',
    resume,
    serverTime: 5000,
    resumed: false,
  });

  it('says hello, becomes open on welcome and pings to keep the clock fresh', () => {
    const socket = make();
    expect(socket.status.get().state).toBe('closed');
    socket.connect();
    expect(socket.status.get().state).toBe('connecting');
    const [raw] = sockets;
    raw?.open();
    expect(raw?.sent[0]).toEqual({ type: 'hello', v: 1, nick: 'Ada', guestId: 'guest-12345678' });
    raw?.say(welcome());
    expect(socket.status.get()).toEqual({ state: 'open', attempt: 0, retryInMs: null });
    expect(raw?.sent[1]).toEqual({ type: 'ping', t: 1000 });
    nowValue = 1100;
    raw?.say({ type: 'pong', t: 1000, st: 5050 });
    expect(socket.clock.rtt).toBe(100);
    vi.advanceTimersByTime(2000);
    expect(raw?.sent).toHaveLength(3);
  });

  it('passes validated messages to listeners and ignores junk', () => {
    const socket = make();
    const seen: string[] = [];
    const off = socket.onMessage((m) => seen.push(m.type));
    socket.connect();
    const raw = sockets[0];
    raw?.open();
    raw?.say(welcome());
    raw?.onmessage?.({ data: 'not json' });
    raw?.onmessage?.({ data: new ArrayBuffer(4) });
    raw?.say({ type: 'room', room: 'nonsense' });
    raw?.say({ type: 'pong', t: 1, st: 2 });
    expect(seen).toEqual(['welcome', 'pong']);
    off();
    raw?.say({ type: 'pong', t: 1, st: 2 });
    expect(seen).toHaveLength(2);
  });

  it('refuses to send while offline and sends JSON when open', () => {
    const socket = make();
    expect(socket.send({ type: 'quickplay' })).toBe(false);
    socket.connect();
    sockets[0]?.open();
    expect(socket.send({ type: 'quickplay' })).toBe(false);
    sockets[0]?.say(welcome());
    expect(socket.send({ type: 'quickplay' })).toBe(true);
    expect(sockets[0]?.sent.at(-1)).toEqual({ type: 'quickplay' });
  });

  it('reconnects with backoff and presents the resume token', () => {
    const socket = make({ random: () => 1 });
    socket.connect();
    sockets[0]?.open();
    sockets[0]?.say(welcome('T'.repeat(32)));
    sockets[0]?.drop(1006);
    expect(socket.status.get()).toEqual({ state: 'reconnecting', attempt: 1, retryInMs: 500 });
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]?.drop(1006);
    expect(socket.status.get()).toMatchObject({ attempt: 2, retryInMs: 1000 });
    vi.advanceTimersByTime(1000);
    sockets[2]?.open();
    expect(sockets[2]?.sent[0]).toMatchObject({ type: 'hello', resume: 'T'.repeat(32) });
    sockets[2]?.say(welcome('T'.repeat(32)));
    expect(socket.status.get()).toEqual({ state: 'open', attempt: 0, retryInMs: null });
  });

  it('caps the delay, spreads it with jitter, and gives up after the maximum attempts', () => {
    const socket = make({ random: () => 0, maxAttempts: 6 });
    socket.connect();
    const delays: Array<number | null> = [];
    for (let i = 0; i < 6; i++) {
      sockets.at(-1)?.drop(1006);
      delays.push(socket.status.get().retryInMs);
      vi.advanceTimersByTime(10_000);
    }
    expect(delays).toEqual([250, 500, 1000, 2000, 4000, 4000]);
    sockets.at(-1)?.drop(1006);
    expect(socket.status.get()).toMatchObject({ state: 'failed', attempt: 7 });
    expect(sockets).toHaveLength(7);
  });

  it('retries immediately when asked, from failed or waiting', () => {
    const socket = make({ maxAttempts: 1 });
    socket.connect();
    sockets[0]?.drop(1006);
    sockets[0]?.drop(1006);
    socket.retryNow();
    socket.retryNow();
    expect(sockets.length).toBeGreaterThanOrEqual(2);
    expect(socket.status.get().state).toBe('connecting');
    socket.connect();
    expect(sockets.length).toBe(2);
  });

  it('does not retry after a deliberate close, a replacement or a refusal', () => {
    const closing = make();
    closing.connect();
    closing.close();
    expect(sockets[0]?.closedWith).toBe(1000);
    expect(closing.status.get().state).toBe('closed');
    for (const code of [4001, 1008]) {
      sockets.length = 0;
      const socket = make();
      socket.connect();
      sockets[0]?.drop(code);
      vi.advanceTimersByTime(60_000);
      expect(socket.status.get().state).toBe('closed');
      expect(sockets).toHaveLength(1);
    }
  });

  it('ignores a late close from a socket it already replaced', () => {
    const socket = make();
    socket.connect();
    const first = sockets[0];
    first?.drop(1006);
    vi.advanceTimersByTime(1000);
    first?.drop(1006);
    expect(socket.status.get()).toMatchObject({ state: 'reconnecting', attempt: 1 });
    expect(sockets).toHaveLength(2);
  });
});
