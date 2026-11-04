import { describe, expect, it, vi } from 'vitest';
import {
  TICK_MS,
  applyInput,
  createWorld,
  drainEvents,
  getSnake,
  snapshotFromWorld,
  stepWorld,
  type Dir,
  type RoomView,
  type RoundEndMsg,
  type SnapshotMsg,
  type WorldState,
} from '@snake/shared';
import { ClockSync } from '../src/net/clockSync';
import { OnlineGame, RENDER_DELAY_MS } from '../src/net/onlineGame';

function room(players: Array<[string, string, number | null, 'player' | 'spectator']>): RoomView {
  return {
    code: 'ABCDE',
    phase: 'playing',
    visibility: 'private',
    theme: 'kiln',
    hostId: 'me',
    players: players.map(([id, nick, slot, role]) => ({ id, nick, slot, ready: true, connected: true, role })),
    countdownEndsAt: null,
    matchStartedAt: 0,
    maxPlayers: 8,
  };
}

const PLAYERS = room([
  ['me', 'Ada', 0, 'player'],
  ['bo', 'Bo', 1, 'player'],
  ['sp', 'Watcher', null, 'spectator'],
]);

/** A synced clock where server time = client time + 10000, round trip `rtt`. */
function clock(rtt: number): ClockSync {
  const sync = new ClockSync();
  sync.record(0, rtt, 10_000 + rtt / 2);
  return sync;
}

function snapshot(world: WorldState, serverTime: number, ack: Array<[number, number]> = []): SnapshotMsg {
  return snapshotFromWorld(world, serverTime, new Map(ack), drainEvents(world));
}

interface Rig {
  game: OnlineGame;
  sent: Array<{ seq: number; dir: Dir }>;
  setNow: (ms: number) => void;
  world: WorldState;
}

function rig(options: { rtt?: number; roomView?: RoomView; online?: boolean } = {}): Rig {
  let nowMs = 1000;
  const sent: Array<{ seq: number; dir: Dir }> = [];
  const world = createWorld({ seed: 3, slots: [0, 1] });
  world.nextPowerUpTick = Number.MAX_SAFE_INTEGER;
  const game = new OnlineGame({
    send: (msg) => {
      if (options.online === false) return false;
      sent.push({ seq: msg.seq, dir: msg.dir });
      return true;
    },
    clock: clock(options.rtt ?? 0),
    room: () => options.roomView ?? PLAYERS,
    playerId: () => 'me',
    now: () => nowMs,
  });
  return { game, sent, world, setNow: (ms) => (nowMs = ms) };
}

describe('OnlineGame roster and frames', () => {
  it('knows who is who from the room, and who is watching', () => {
    const { game } = rig();
    expect(game.roster).toEqual([
      { slot: 0, name: 'Ada', isLocal: true, isBot: false },
      { slot: 1, name: 'Bo', isLocal: false, isBot: false },
    ]);
    expect(game.offline).toBe(false);
    const watcher = new OnlineGame({ send: () => true, clock: clock(0), room: () => PLAYERS, playerId: () => 'sp' });
    expect(watcher.roster.some((r) => r.isLocal)).toBe(false);
  });

  it('shows an empty board with the room theme until the first snapshot', () => {
    const { game } = rig();
    expect(game.frame(1000)).toMatchObject({ snakes: [], theme: 'kiln', localSlot: 0, tick: 0 });
    expect(game.hud()).toMatchObject({ phase: 'playing', snakes: [], lag: { level: 'good' } });
  });

  it('draws the latest snapshot, with names and time left in the HUD', () => {
    const { game, world } = rig();
    game.onSnapshot(snapshot(world, 11_000));
    const frame = game.frame(1000 + RENDER_DELAY_MS + 10);
    expect(frame.snakes.map((s) => [s.slot, s.alive, s.points.length])).toEqual([
      [0, true, 4],
      [1, true, 4],
    ]);
    expect(frame.foods.length).toBeGreaterThan(0);
    const hud = game.hud();
    expect(hud.snakes.map((s) => [s.name, s.isLocal])).toEqual([
      ['Ada', true],
      ['Bo', false],
    ]);
    expect(hud.remainingMs).toBeGreaterThan(0);
  });

  it('ignores corrupt and out-of-order snapshots', () => {
    const { game, world } = rig();
    stepWorld(world);
    stepWorld(world);
    game.onSnapshot(snapshot(world, 11_000));
    game.onSnapshot(snapshot(createWorld({ seed: 3, slots: [0, 1] }), 10_000));
    expect(game.frame(1000).tick).toBe(2);
    const first = snapshot(world, 11_100);
    const base = first.snakes[0];
    if (!base) throw new Error('expected a snake');
    const origin: [number, number] = [0, 0];
    game.onSnapshot({ ...first, snakes: [{ ...base, h: origin, p: '3' }] });
    expect(game.badSnapshots).toBe(1);
  });

  it("hands each snapshot's events to listeners once, and stops after dispose", () => {
    const { game, world } = rig();
    const events: string[] = [];
    game.subscribeEvents((e) => events.push(e.type));
    const off = game.subscribeHud(() => undefined);
    world.foods.push({ id: 99, kind: 'apple', x: 7, y: 14 });
    stepWorld(world);
    stepWorld(world);
    game.onSnapshot(snapshot(world, 11_000));
    expect(events).toEqual(['eat']);
    game.onSnapshot(snapshot(world, 11_070));
    expect(events).toEqual(['eat']);
    off();
    game.dispose();
    world.foods.push({ id: 100, kind: 'apple', x: 8, y: 14 });
    stepWorld(world);
    stepWorld(world);
    game.onSnapshot(snapshot(world, 11_140));
    expect(events).toEqual(['eat']);
  });

  it('ends with the server result once the round-end message arrives', () => {
    const { game, world } = rig();
    game.onSnapshot(snapshot(world, 11_000));
    const hudListener = vi.fn();
    game.subscribeHud(hudListener);
    const end: RoundEndMsg = {
      type: 'round_end',
      reason: 'timer',
      endedAtTick: 30,
      winnerSlots: [1],
      standings: [{ slot: 1, rank: 1, score: 20, kills: 0, length: 5, alive: true }],
      names: { '1': 'Bo' },
      ranked: true,
    };
    game.onRoundEnd(end);
    expect(game.hud()).toMatchObject({ phase: 'ended', result: { reason: 'timer', winnerSlots: [1] } });
    expect(hudListener).toHaveBeenCalled();
    game.turn(2);
    expect(game.hud().phase).toBe('ended');
  });
});

describe('interpolation of other snakes', () => {
  it('slides a remote snake smoothly between server steps, a little behind real time', () => {
    const { game, world } = rig();
    game.onSnapshot(snapshot(world, 11_000));
    stepWorld(world);
    stepWorld(world);
    const moved = snapshot(world, 11_000 + 2 * TICK_MS);
    const headAt = (ms: number) => game.frame(ms).snakes.find((s) => s.slot === 1)?.points[0]?.x ?? 0;
    const shownAt = 1000 + 2 * TICK_MS + RENDER_DELAY_MS;
    game.onSnapshot(moved);
    const before = headAt(shownAt);
    const mid = headAt(shownAt + TICK_MS);
    const after = headAt(shownAt + 2 * TICK_MS + 1);
    expect(before).toBeCloseTo(33, 5);
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(after);
    expect(after).toBeCloseTo(32, 5);
  });
});

describe('prediction of the local snake', () => {
  it('turns at once, without waiting for the server to answer', () => {
    const { game, world, sent, setNow } = rig({ rtt: 120 });
    game.onSnapshot(snapshot(world, 11_000));
    const dirNow = (ms: number) => game.frame(ms).snakes.find((s) => s.slot === 0)?.dir;
    expect(dirNow(1000)).toBe(1);
    setNow(1000);
    game.turn(2);
    expect(sent).toEqual([{ seq: 1, dir: 2 }]);
    let turned = false;
    for (let ms = 1000; ms <= 1000 + TICK_MS * 8 && !turned; ms += 8) turned = dirNow(ms) === 2;
    expect(turned).toBe(true);
  });

  it('drops inputs the server has acknowledged, and keeps the rest', () => {
    const { game, world, sent, setNow } = rig({ rtt: 120 });
    game.onSnapshot(snapshot(world, 11_000));
    setNow(1000);
    game.turn(2);
    game.turn(3);
    expect(sent.map((s) => s.seq)).toEqual([1, 2]);
    applyInput(world, 0, 2);
    stepWorld(world);
    game.onSnapshot(snapshot(world, 11_000 + TICK_MS, [[0, 1]]));
    const snap = game.frame(1000 + TICK_MS).snakes.find((s) => s.slot === 0);
    expect(snap).toBeDefined();
    game.onSnapshot(snapshot(world, 11_000 + 2 * TICK_MS, [[0, 2]]));
    expect(game.frame(1000 + 2 * TICK_MS).snakes.find((s) => s.slot === 0)?.alive).toBe(true);
  });

  it('does not predict an input that could not be sent', () => {
    const { game, world, sent } = rig({ online: false });
    game.onSnapshot(snapshot(world, 11_000));
    game.turn(2);
    expect(sent).toEqual([]);
    expect(game.frame(1000 + TICK_MS * 6).snakes.find((s) => s.slot === 0)?.dir).toBe(1);
  });

  it('ignores steering before the match starts, when watching, or when already dead', () => {
    const early = rig();
    early.game.turn(2);
    expect(early.sent).toEqual([]);
    const watcher = new OnlineGame({ send: () => true, clock: clock(0), room: () => PLAYERS, playerId: () => 'sp' });
    const w = createWorld({ seed: 3, slots: [0, 1] });
    watcher.onSnapshot(snapshot(w, 11_000));
    watcher.turn(2);
    const { game, world, sent } = rig();
    const me = getSnake(world, 0);
    if (me) me.alive = false;
    game.onSnapshot(snapshot(world, 11_000));
    game.turn(2);
    expect(sent).toEqual([]);
  });

  it('never predicts more than a dozen ticks beyond the last snapshot, so a stall cannot run away', () => {
    const { game, world } = rig({ rtt: 0 });
    game.onSnapshot(snapshot(world, 11_000));
    const far = game.frame(1000 + 60_000);
    const stalled = game.frame(1000 + 120_000);
    expect(stalled.snakes.find((s) => s.slot === 0)?.points[0]?.x).toBe(
      far.snakes.find((s) => s.slot === 0)?.points[0]?.x,
    );
  });

  it('forgets in-flight inputs and snaps when the connection is re-established', () => {
    const { game, world, setNow } = rig({ rtt: 100 });
    game.onSnapshot(snapshot(world, 11_000));
    setNow(1000);
    game.turn(2);
    game.onReconnected();
    stepWorld(world);
    stepWorld(world);
    game.onSnapshot(snapshot(world, 11_000 + 2 * TICK_MS));
    expect(game.frame(1000 + 2 * TICK_MS).snakes.find((s) => s.slot === 0)?.dir).toBe(1);
  });
});

describe('prediction against a laggy server', () => {
  /** Runs server and client with one-way latency of `lag` ticks and compares what each believes. */
  function run(lag: number, script: Array<[number, Dir]>) {
    const world = createWorld({ seed: 5, slots: [0, 1] });
    world.nextPowerUpTick = Number.MAX_SAFE_INTEGER;
    let nowMs = 1000;
    const inbox: Array<{ at: number; seq: number; dir: Dir }> = [];
    const toClient: Array<{ at: number; msg: SnapshotMsg }> = [];
    const game = new OnlineGame({
      send: (msg) => {
        inbox.push({ at: nowMs + lag * TICK_MS, seq: msg.seq, dir: msg.dir });
        return true;
      },
      clock: clock(lag * 2 * TICK_MS),
      room: () => PLAYERS,
      playerId: () => 'me',
      now: () => nowMs,
    });
    const acks = new Map<number, number>();
    const log: Array<{ tick: number; shown: number | undefined; real: number | undefined }> = [];
    for (let tick = 0; tick <= 60; tick++) {
      nowMs = 1000 + tick * TICK_MS;
      for (const input of inbox.filter((i) => i.at <= nowMs)) {
        applyInput(world, 0, input.dir);
        acks.set(0, input.seq);
      }
      inbox.splice(0, inbox.length, ...inbox.filter((i) => i.at > nowMs));
      if (tick > 0) stepWorld(world);
      toClient.push({
        at: nowMs + lag * TICK_MS,
        msg: snapshotFromWorld(world, 10_000 + nowMs, acks, drainEvents(world)),
      });
      for (const item of toClient.filter((m) => m.at <= nowMs)) game.onSnapshot(item.msg);
      toClient.splice(0, toClient.length, ...toClient.filter((m) => m.at > nowMs));
      for (const [at, dir] of script) if (at === tick) game.turn(dir);
      const shown = game.frame(nowMs).snakes.find((s) => s.slot === 0);
      log.push({ tick, shown: shown?.points[0]?.y, real: getSnake(world, 0)?.body[0]?.y });
    }
    return { game, world, log };
  }

  it('shows a steering input long before the server confirms it', () => {
    const { log } = run(3, [[10, 2]]);
    const firstShown = log.find((l) => l.tick > 10 && (l.shown ?? 0) > 14.6)?.tick ?? 99;
    const firstReal = log.find((l) => l.tick > 10 && (l.real ?? 0) > 14)?.tick ?? 99;
    expect(firstShown).toBeLessThan(firstReal + 6);
    expect(firstShown).toBeLessThanOrEqual(firstReal + 1);
  });

  it('converges on the server position once the lag has passed', () => {
    const { game, world } = run(3, [
      [10, 2],
      [24, 3],
    ]);
    const settled = game.frame(1000 + 60 * TICK_MS + 4 * TICK_MS);
    const mine = settled.snakes.find((s) => s.slot === 0);
    const real = getSnake(world, 0)?.body;
    expect(mine?.points.length).toBe(real?.length);
    expect(Math.abs((mine?.points[0]?.y ?? 0) - (real?.[0]?.y ?? 0))).toBeLessThan(8);
  });
});
