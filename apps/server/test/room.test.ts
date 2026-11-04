import { END_GRACE_MS, MAX_PLAYERS, SUMMARY_SECONDS, TICK_MS } from '@snake/shared';
import { describe, expect, it } from 'vitest';
import { Harness } from './harness';

describe('lobby', () => {
  it('creates a room with a code, a host and a lobby view', () => {
    const h = new Harness();
    const [host] = h.lobby(1).players;
    const view = host?.room;
    expect(view?.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
    expect(view).toMatchObject({ phase: 'lobby', visibility: 'private', hostId: host?.id, maxPlayers: MAX_PLAYERS });
    expect(view?.players).toEqual([
      { id: host?.id, nick: 'P1', slot: 0, ready: false, connected: true, role: 'player' },
    ]);
  });

  it('lets others join by code in any letter case and seats them in order', () => {
    const h = new Harness();
    const { players, code } = h.lobby(1);
    const guest = h.player('Zed');
    guest.send({ type: 'join_room', code: code.toLowerCase() });
    expect(guest.room?.players.map((p) => [p.nick, p.slot])).toEqual([
      ['P1', 0],
      ['Zed', 1],
    ]);
    expect(players[0]?.room?.players).toHaveLength(2);
  });

  it('answers unknown codes, double joins and actions outside a room with the right error', () => {
    const h = new Harness();
    const p = h.player('Ada');
    p.send({ type: 'join_room', code: 'ZZZZZ' });
    p.send({ type: 'ready', ready: true });
    p.send({ type: 'create_room', visibility: 'public', theme: 'kiln' });
    p.send({ type: 'create_room', visibility: 'public', theme: 'kiln' });
    p.send({ type: 'join_room', code: p.room?.code ?? '' });
    expect(p.errors).toEqual(['room_not_found', 'not_in_room', 'already_in_room', 'already_in_room']);
  });

  it('refuses a ninth player but lets them watch', () => {
    const h = new Harness();
    const { players, code } = h.lobby(MAX_PLAYERS);
    const late = h.player('Late');
    late.send({ type: 'join_room', code });
    expect(late.errors).toEqual(['room_full']);
    late.send({ type: 'join_room', code, spectate: true });
    expect(late.room?.players.find((p) => p.nick === 'Late')?.role).toBe('spectator');
    expect(players[0]?.room?.players).toHaveLength(MAX_PLAYERS + 1);
  });

  it('keeps theme choice to the host, in the lobby', () => {
    const h = new Harness();
    const { players } = h.lobby(2);
    const [host, guest] = players;
    guest?.send({ type: 'set_theme', theme: 'kiln' });
    host?.send({ type: 'set_theme', theme: 'tidepool' });
    expect(guest?.errors).toEqual(['not_host']);
    expect(guest?.room?.theme).toBe('tidepool');
    for (const p of players) p.send({ type: 'ready', ready: true });
    host?.send({ type: 'set_theme', theme: 'kiln' });
    expect(host?.errors).toEqual(['wrong_phase']);
  });

  it('hands the host role on when the host leaves, and closes an empty room', () => {
    const h = new Harness();
    const { players, code } = h.lobby(2);
    const [host, guest] = players;
    host?.send({ type: 'leave_room' });
    expect(guest?.room?.hostId).toBe(guest?.id);
    expect(h.rooms.find(code)).toBeDefined();
    guest?.send({ type: 'leave_room' });
    expect(h.rooms.find(code)).toBeUndefined();
    expect(h.rooms.count()).toBe(0);
  });

  it('stops creating rooms at the configured cap', () => {
    const h = new Harness({ maxRooms: 1 });
    h.player('A').send({ type: 'create_room', visibility: 'public', theme: 'parchment' });
    const b = h.player('B');
    b.send({ type: 'create_room', visibility: 'public', theme: 'parchment' });
    b.send({ type: 'quickplay' });
    expect(b.errors).toEqual(['server_busy']);
  });
});

describe('quick play', () => {
  it('puts players into the same public lobby, ready, and starts the countdown at two', () => {
    const h = new Harness();
    const a = h.player('A');
    a.send({ type: 'quickplay' });
    expect(a.room).toMatchObject({ visibility: 'public', phase: 'lobby' });
    const b = h.player('B');
    b.send({ type: 'quickplay' });
    expect(b.room?.code).toBe(a.room?.code);
    expect(a.room?.phase).toBe('countdown');
    expect(a.room?.countdownEndsAt).toBe(h.clock.now() + 3000);
    expect(h.rooms.count()).toBe(1);
  });

  it('opens a fresh lobby when the existing one is already playing', () => {
    const h = new Harness();
    const first = [h.player('A'), h.player('B')];
    for (const p of first) p.send({ type: 'quickplay' });
    h.clock.advance(3000);
    const c = h.player('C');
    c.send({ type: 'quickplay' });
    expect(c.room?.code).not.toBe(first[0]?.room?.code);
    expect(h.rooms.count()).toBe(2);
  });
});

describe('countdown and match start', () => {
  it('needs two ready players and starts after three seconds', () => {
    const h = new Harness();
    const { players } = h.lobby(2);
    const [a, b] = players;
    a?.send({ type: 'ready', ready: true });
    expect(a?.room?.phase).toBe('lobby');
    b?.send({ type: 'ready', ready: true });
    expect(b?.room).toMatchObject({ phase: 'countdown', countdownEndsAt: h.clock.now() + 3000 });
    h.clock.advance(2999);
    expect(a?.room?.phase).toBe('countdown');
    h.clock.advance(1);
    expect(a?.room).toMatchObject({ phase: 'playing', matchStartedAt: h.clock.now() });
    expect(a?.snapshots[0]).toMatchObject({ tick: 0, time: h.clock.now() });
    expect(a?.snapshots[0]?.snakes.map((s) => s.s)).toEqual([0, 1]);
    expect(b?.snapshots).toHaveLength(1);
  });

  it('cancels when someone un-readies, or a player drops', () => {
    const h = new Harness();
    const { players } = h.lobby(2);
    const [a, b] = players;
    for (const p of players) p.send({ type: 'ready', ready: true });
    b?.send({ type: 'ready', ready: false });
    expect(a?.room).toMatchObject({ phase: 'lobby', countdownEndsAt: null });
    h.clock.advance(5000);
    expect(a?.room?.phase).toBe('lobby');
    b?.send({ type: 'ready', ready: true });
    expect(a?.room?.phase).toBe('countdown');
    b?.drop();
    expect(a?.room?.phase).toBe('lobby');
    expect(a?.room?.players.find((p) => p.nick === 'P2')?.connected).toBe(false);
  });

  it('does not count watchers, and freezes the roster once counting', () => {
    const h = new Harness();
    const { players, code } = h.lobby(2);
    const watcher = h.player('W');
    watcher.send({ type: 'join_room', code, spectate: true });
    for (const p of players) p.send({ type: 'ready', ready: true });
    expect(players[0]?.room?.phase).toBe('countdown');
    const late = h.player('Late');
    late.send({ type: 'join_room', code });
    expect(late.room?.players.find((p) => p.nick === 'Late')).toMatchObject({ role: 'spectator', slot: null });
    h.clock.advance(3000);
    expect(players[0]?.snapshots[0]?.snakes).toHaveLength(2);
    expect(late.snapshots).toHaveLength(1);
    expect(watcher.snapshots).toHaveLength(1);
  });
});

describe('a running match', () => {
  it('ticks at the fixed rate and publishes each tick to everyone', () => {
    const h = new Harness();
    const { players } = h.startMatch(2);
    h.clock.ticks(10);
    const ticks = players[0]?.snapshots.map((s) => s.tick);
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(players[0]?.snapshots[10]?.time).toBe((players[0]?.snapshots[0]?.time ?? 0) + 10 * TICK_MS);
    expect(players[1]?.snapshots).toHaveLength(11);
  });

  it('acknowledges each accepted input and ignores duplicates and replays', () => {
    const h = new Harness();
    const { players } = h.startMatch(2);
    const [a] = players;
    h.clock.ticks(1);
    const seq = a?.turn(2) ?? 0;
    a?.send({ type: 'input', seq, dir: 0 });
    a?.send({ type: 'input', seq: seq - 1, dir: 0 });
    h.clock.ticks(1);
    expect(a?.snapshots[a.snapshots.length - 1]?.ack).toEqual({ '0': seq });
    expect(h.stats.counters.inputsAccepted).toBe(1);
    expect(h.stats.counters.inputsDuplicate).toBe(2);
  });

  it('moves the snake only through accepted turns', () => {
    const h = new Harness();
    const { players } = h.startMatch(2);
    const [a] = players;
    a?.turn(2);
    h.clock.ticks(6);
    const last = a?.snapshots[a.snapshots.length - 1];
    const mine = last?.snakes.find((s) => s.s === 0);
    expect(mine?.d).toBe(2);
  });

  it('ignores input from spectators and from before the match', () => {
    const h = new Harness();
    const { players, code } = h.lobby(2);
    players[0]?.turn(1);
    const watcher = h.player('W');
    watcher.send({ type: 'join_room', code, spectate: true });
    for (const p of players) p.send({ type: 'ready', ready: true });
    h.clock.advance(3000);
    watcher.turn(2);
    watcher.turn(1);
    expect(h.stats.counters.inputsAccepted).toBe(0);
  });

  it('ends on the timer, announces standings, records the leaderboard, then returns to the lobby', () => {
    const h = new Harness({ roundTicks: 30 });
    const { players } = h.startMatch(2);
    h.clock.ticks(30);
    expect(players[0]?.snapshots.at(-1)?.tick).toBe(30);
    expect(players[0]?.of('round_end')).toHaveLength(0);
    h.clock.advance(END_GRACE_MS);
    const [end] = players[0]?.of('round_end') ?? [];
    expect(end).toMatchObject({ reason: 'timer', ranked: true, names: { '0': 'P1', '1': 'P2' } });
    expect(end?.standings).toHaveLength(2);
    expect(players[0]?.room?.phase).toBe('summary');
    expect(h.leaderboard.top(10).entries.map((e) => e.matches)).toEqual([1, 1]);
    h.clock.advance(SUMMARY_SECONDS * 1000);
    expect(players[0]?.room).toMatchObject({ phase: 'lobby' });
    expect(players[0]?.room?.players.every((p) => !p.ready)).toBe(true);
    h.clock.ticks(5);
    expect(players[0]?.snapshots.at(-1)?.tick).toBe(30);
  });

  it('plays another round after the lobby', () => {
    const h = new Harness({ roundTicks: 30 });
    const { players } = h.startMatch(2);
    h.clock.ticks(30);
    h.clock.advance(END_GRACE_MS + SUMMARY_SECONDS * 1000);
    for (const p of players) p.send({ type: 'ready', ready: true });
    h.clock.advance(3000);
    expect(players[0]?.room?.phase).toBe('playing');
    expect(players[0]?.snapshots.at(-1)?.tick).toBe(0);
    players[0]?.turn(2);
    expect(h.stats.counters.inputsAccepted).toBe(1);
  });

  it('promotes people who were only watching once the next lobby opens', () => {
    const h = new Harness({ roundTicks: 30 });
    const { players, code } = h.startMatch(2);
    const late = h.player('Late');
    late.send({ type: 'join_room', code });
    expect(late.room?.players.find((p) => p.nick === 'Late')?.role).toBe('spectator');
    h.clock.ticks(30);
    h.clock.advance(END_GRACE_MS + SUMMARY_SECONDS * 1000);
    expect(late.room?.players.find((p) => p.nick === 'Late')).toMatchObject({ role: 'player', slot: 2 });
    expect(players[0]?.room?.players).toHaveLength(3);
  });
});

describe('leaving and dropping out of a match', () => {
  it('forfeits the snake of a player who leaves, and ends a two-player match', () => {
    const h = new Harness();
    const { players } = h.startMatch(2);
    h.clock.ticks(2);
    players[1]?.send({ type: 'leave_room' });
    const last = players[0]?.snapshots.at(-1);
    expect(last?.events).toContainEqual(expect.objectContaining({ type: 'die', slot: 1, cause: 'forfeit' }));
    h.clock.advance(END_GRACE_MS);
    expect(players[0]?.of('round_end')[0]).toMatchObject({ reason: 'last-standing', winnerSlots: [0] });
  });

  it('keeps a dropped player seated and moving, and gives the seat back on return', () => {
    const h = new Harness();
    const { players } = h.startMatch(3);
    const [, b] = players;
    h.clock.ticks(2);
    b?.drop();
    expect(players[0]?.room?.players.find((p) => p.nick === 'P2')?.connected).toBe(false);
    h.clock.ticks(5);
    const back = b?.comeBack();
    expect(back?.welcome.resumed).toBe(true);
    expect(back?.welcome.playerId).toBe(b?.id);
    expect(back?.room).toMatchObject({ phase: 'playing' });
    expect(back?.snapshots).toHaveLength(1);
    expect(players[0]?.room?.players.find((p) => p.nick === 'P2')?.connected).toBe(true);
    back?.turn(2);
    expect(h.stats.counters.inputsAccepted).toBe(1);
  });

  it('lets a dropped snake coast on its own, and gives the seat up after the grace period', () => {
    const h = new Harness();
    const { players } = h.startMatch(3);
    players[1]?.drop();
    h.clock.advance(14_000);
    expect(players[0]?.room?.players.map((p) => p.nick)).toEqual(['P1', 'P2', 'P3']);
    expect(players[0]?.snapshots.flatMap((s) => s.events)).toContainEqual(
      expect.objectContaining({ type: 'die', slot: 1, cause: 'wall' }),
    );
    h.clock.advance(1_001);
    expect(players[0]?.room?.players.map((p) => p.nick)).toEqual(['P1', 'P3']);
    const tooLate = players[1]?.comeBack();
    expect(tooLate?.welcome.resumed).toBe(false);
    expect(tooLate?.room).toBeNull();
  });

  it('replaces a still-open older connection when the same player resumes', () => {
    const h = new Harness();
    const { players } = h.lobby(2);
    const [a] = players;
    const second = a?.comeBack();
    expect(a?.conn.closed).toEqual({ code: 4001, reason: 'replaced by a newer connection' });
    expect(a?.of('bye')[0]?.reason).toBe('replaced');
    expect(second?.welcome.resumed).toBe(true);
    a?.session.closed();
    expect(second?.room?.players.find((p) => p.nick === 'P1')?.connected).toBe(true);
  });

  it('treats an unknown resume token as a new visitor', () => {
    const h = new Harness();
    const p = h.player('Ada');
    expect(p.session.hasPlayer).toBe(true);
    const fake = h.player('Eve', 'A'.repeat(32));
    expect(fake.welcome.resumed).toBe(false);
    expect(fake.welcome.playerId).not.toBe(p.id);
  });
});

describe('empty rooms', () => {
  it('are removed a minute after the last connected person drops', () => {
    const h = new Harness();
    const { players, code } = h.lobby(2);
    for (const p of players) p.drop();
    expect(h.rooms.find(code)).toBeDefined();
    h.clock.advance(14_000);
    expect(h.rooms.find(code)).toBeDefined();
    h.clock.advance(1_001);
    expect(h.rooms.count()).toBe(0);
  });

  it('survive when someone reconnects in time', () => {
    const h = new Harness();
    const { players, code } = h.lobby(2);
    for (const p of players) p.drop();
    h.clock.advance(10_000);
    const back = players[0]?.comeBack();
    h.clock.advance(120_000);
    expect(h.rooms.find(code)).toBeDefined();
    expect(back?.room?.code).toBe(code);
  });
});
