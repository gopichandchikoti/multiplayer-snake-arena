import { describe, expect, it, vi } from 'vitest';
import { DIRS, GRID_H, GRID_W, TICK_MS, createWorld, stepWorld, type GameEvent, type SnakeState } from '@snake/shared';
import { SWIPE_THRESHOLD, createSwipeTracker, dirForKey, dirForSwipe, isTypingTarget } from '../src/game/input';
import {
  angleForDir,
  cellToPixel,
  computeLayout,
  screenDirToWorld,
  shouldShowDpad,
  worldDirToScreen,
} from '../src/game/layout';
import { PracticeGame } from '../src/game/practice';
import { SnakeTweener } from '../src/game/tween';

const body = (cells: Array<[number, number]>) => cells.map(([x, y]) => ({ x, y }));

function snake(cells: Array<[number, number]>, extra: Partial<SnakeState> = {}): SnakeState {
  const world = createWorld({ seed: 1, slots: [0, 1] });
  const base = world.snakes[0];
  if (!base) throw new Error('no snake');
  return { ...base, body: body(cells), ...extra };
}

describe('SnakeTweener', () => {
  const start: Array<[number, number]> = [
    [5, 5],
    [4, 5],
    [3, 5],
    [2, 5],
  ];
  const moved: Array<[number, number]> = [
    [6, 5],
    [5, 5],
    [4, 5],
    [3, 5],
  ];

  it('slides every segment one cell over the move interval', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(snake(moved), 1000);
    expect(tween.sample(0, 1000)).toEqual(body(start));
    const half = tween.sample(0, 1000 + TICK_MS) ?? [];
    expect(half[0]?.x).toBeCloseTo(5.5);
    expect(half[0]?.y).toBe(5);
    expect(half[3]?.x).toBeCloseTo(2.5);
    expect(tween.sample(0, 1000 + TICK_MS * 2)).toEqual(body(moved));
    expect(tween.sample(0, 99999)).toEqual(body(moved));
  });

  it('keeps the tail still while the snake grows', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(
      snake([
        [6, 5],
        [5, 5],
        [4, 5],
        [3, 5],
        [2, 5],
      ]),
      1000,
    );
    const half = tween.sample(0, 1000 + TICK_MS) ?? [];
    expect(half).toHaveLength(5);
    expect(half[4]).toEqual({ x: 2, y: 5 });
  });

  it('continues from where the snake was drawn when the next move arrives early', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(snake(moved), 1000);
    tween.push(
      snake([
        [7, 5],
        [6, 5],
        [5, 5],
        [4, 5],
      ]),
      1000 + TICK_MS,
    );
    const first = tween.sample(0, 1000 + TICK_MS) ?? [];
    expect(first[0]?.x).toBeCloseTo(5.5);
  });

  it('snaps instead of sliding for anything but a one-cell step', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(
      snake([
        [20, 20],
        [20, 21],
        [20, 22],
        [20, 23],
      ]),
      500,
    );
    expect(tween.sample(0, 500)).toEqual(
      body([
        [20, 20],
        [20, 21],
        [20, 22],
        [20, 23],
      ]),
    );
  });

  it('ignores identical states and forgets dead or dropped snakes', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(snake(start), 400);
    expect(tween.sample(0, 400)).toEqual(body(start));
    tween.push(snake(start, { alive: false }), 800);
    expect(tween.sample(0, 800)).toBeNull();
    tween.push(snake(start), 900);
    tween.forget(0);
    expect(tween.sample(0, 900)).toBeNull();
  });

  it('uses the faster interval while surging', () => {
    const tween = new SnakeTweener();
    tween.push(snake(start), 0);
    tween.push(snake(moved, { surge: 10 }), 1000);
    expect(tween.sample(0, 1000 + TICK_MS)).toEqual(body(moved));
  });
});

describe('input mapping', () => {
  it('maps physical keys, not letters', () => {
    expect(dirForKey('ArrowUp')).toBe(0);
    expect(dirForKey('KeyD')).toBe(1);
    expect(dirForKey('KeyS')).toBe(2);
    expect(dirForKey('ArrowLeft')).toBe(3);
    expect(dirForKey('Space')).toBeNull();
    expect(dirForKey('Enter')).toBeNull();
  });

  it('reads swipes by their dominant axis and ignores short drags', () => {
    expect(dirForSwipe(40, 5)).toBe(1);
    expect(dirForSwipe(-40, 5)).toBe(3);
    expect(dirForSwipe(5, 40)).toBe(2);
    expect(dirForSwipe(5, -40)).toBe(0);
    expect(dirForSwipe(SWIPE_THRESHOLD - 1, 0)).toBeNull();
    expect(dirForSwipe(Number.NaN, Number.NaN)).toBeNull();
  });

  it('chains turns in one unbroken gesture and stops after release', () => {
    const tracker = createSwipeTracker(20);
    expect(tracker.move(100, 100)).toBeNull();
    tracker.start(100, 100);
    expect(tracker.move(110, 100)).toBeNull();
    expect(tracker.move(130, 100)).toBe(1);
    expect(tracker.move(130, 112)).toBeNull();
    expect(tracker.move(131, 135)).toBe(2);
    tracker.end();
    expect(tracker.move(300, 300)).toBeNull();
  });

  it('knows when the user is typing', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('layout', () => {
  it('keeps the arena upright on a wide screen and turns it on a tall one', () => {
    const wide = computeLayout(1280, 720);
    expect(wide.rotated).toBe(false);
    expect([wide.cols, wide.rows]).toEqual([GRID_W, GRID_H]);
    const tall = computeLayout(360, 560);
    expect(tall.rotated).toBe(true);
    expect([tall.cols, tall.rows]).toEqual([GRID_H, GRID_W]);
    expect(tall.cell).toBeGreaterThan(computeLayout(360, 560 / 100).cell);
  });

  it('centres the arena and never overflows the canvas', () => {
    for (const [w, h] of [
      [1280, 720],
      [360, 560],
      [800, 800],
      [320, 480],
      [2000, 500],
    ] as const) {
      const l = computeLayout(w, h, 8);
      expect(l.originX).toBeGreaterThanOrEqual(0);
      expect(l.originY).toBeGreaterThanOrEqual(0);
      expect(l.originX + l.cols * l.cell).toBeLessThanOrEqual(w);
      expect(l.originY + l.rows * l.cell).toBeLessThanOrEqual(h);
    }
    expect(computeLayout(0, 0).cell).toBeGreaterThanOrEqual(1);
  });

  it('puts cells where the layout says, in both orientations', () => {
    const upright = computeLayout(400, 280);
    expect(cellToPixel(upright, { x: 0, y: 0 })).toEqual({
      x: upright.originX + upright.cell / 2,
      y: upright.originY + upright.cell / 2,
    });
    const turned = computeLayout(280, 400);
    const corner = cellToPixel(turned, { x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(turned.originX + (GRID_H - 0.5) * turned.cell);
    expect(corner.y).toBeCloseTo(turned.originY + 0.5 * turned.cell);
  });

  it('translates screen directions to arena directions and back', () => {
    const upright = { rotated: false };
    const turned = { rotated: true };
    for (const dir of [0, 1, 2, 3] as const) {
      expect(screenDirToWorld(upright, dir)).toBe(dir);
      expect(worldDirToScreen(turned, screenDirToWorld(turned, dir))).toBe(dir);
    }
    expect(screenDirToWorld(turned, 2)).toBe(1);
    expect(screenDirToWorld(turned, 1)).toBe(0);
  });

  it('agrees with itself: arrowing "right" on screen moves the snake right on screen', () => {
    const turned = computeLayout(280, 400);
    const before = cellToPixel(turned, { x: 10, y: 10 });
    const worldDir = screenDirToWorld(turned, 1);
    const step = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ][worldDir];
    const after = cellToPixel(turned, { x: 10 + (step?.x ?? 0), y: 10 + (step?.y ?? 0) });
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('draws sprites facing the right way and decides when to show the pad', () => {
    expect(DIRS.map((d) => angleForDir(d))).toEqual([-Math.PI / 2, 0, Math.PI / 2, Math.PI]);
    expect(shouldShowDpad('on', false)).toBe(true);
    expect(shouldShowDpad('off', true)).toBe(false);
    expect(shouldShowDpad('auto', true)).toBe(true);
    expect(shouldShowDpad('auto', false)).toBe(false);
  });
});

describe('PracticeGame', () => {
  const options = { bots: 2, level: 'hard', theme: 'kiln', seed: 7, playerName: 'Ada' } as const;

  it('counts down 3-2-1 before anything moves', () => {
    const game = new PracticeGame(options);
    expect(game.hud()).toMatchObject({ phase: 'countdown', countdown: 3 });
    game.frame(0);
    game.frame(1000);
    expect(game.hud()).toMatchObject({ phase: 'countdown', countdown: 2 });
    game.frame(2500);
    expect(game.hud().countdown).toBe(1);
    expect(game.frame(2500).tick).toBe(0);
    game.frame(3000);
    expect(game.hud().phase).toBe('playing');
    expect(game.frame(3000 + TICK_MS).tick).toBeGreaterThan(0);
  });

  it('lists the player first and names the bots', () => {
    const game = new PracticeGame(options);
    expect(game.offline).toBe(true);
    expect(game.roster.map((r) => [r.slot, r.name, r.isLocal, r.isBot])).toEqual([
      [0, 'Ada', true, false],
      [1, 'Pip', false, true],
      [2, 'Marlo', false, true],
    ]);
  });

  it('keeps the bot count within 1 to 7', () => {
    expect(new PracticeGame({ ...options, bots: 0 }).roster).toHaveLength(2);
    expect(new PracticeGame({ ...options, bots: 40 }).roster).toHaveLength(8);
  });

  it('applies the player turn only once play has begun', () => {
    const game = new PracticeGame(options);
    game.turn(2);
    game.frame(0);
    game.frame(3000);
    game.turn(2);
    for (let t = 3000; t < 3000 + TICK_MS * 6; t += TICK_MS) game.frame(t);
    const me = game.frame(3000 + TICK_MS * 6).snakes.find((s) => s.slot === 0);
    expect(me?.dir).toBe(2);
  });

  it('freezes while paused and does not rush to catch up afterwards', () => {
    const game = new PracticeGame(options);
    game.frame(0);
    game.frame(3000);
    game.frame(3000 + TICK_MS * 4);
    const before = game.frame(3000 + TICK_MS * 4).tick;
    game.setPaused(true);
    expect(game.hud().paused).toBe(true);
    for (let t = 5000; t <= 15_000; t += 500) game.frame(t);
    expect(game.frame(15_000).tick).toBe(before);
    game.setPaused(false);
    game.frame(15_000 + TICK_MS);
    expect(game.frame(15_000 + TICK_MS).tick - before).toBeLessThanOrEqual(2);
    game.turn(1);
  });

  it('skips ahead instead of replaying a long stall', () => {
    const game = new PracticeGame(options);
    game.frame(0);
    game.frame(3000);
    const tick = game.frame(60_000).tick;
    expect(tick).toBeLessThan(12);
  });

  it('reports events, ends the round and hands over a result', () => {
    const game = new PracticeGame({ ...options, bots: 1, level: 'easy' });
    const events: GameEvent[] = [];
    const phases: string[] = [];
    game.subscribeEvents((e) => events.push(e));
    game.subscribeHud((h) => phases.push(h.phase));
    for (let t = 0; t < 140_000 && game.hud().phase !== 'ended'; t += TICK_MS) game.frame(t);
    const hud = game.hud();
    expect(hud.phase).toBe('ended');
    expect(hud.result?.standings.length).toBe(2);
    expect(events.length).toBeGreaterThan(0);
    expect(phases).toContain('countdown');
    expect(phases).toContain('playing');
    expect(game.frame(200_000).tick).toBeGreaterThan(0);
  });

  it('stops notifying after dispose', () => {
    const game = new PracticeGame(options);
    const listener = vi.fn();
    const off = game.subscribeHud(listener);
    game.frame(0);
    off();
    game.frame(1000);
    const calls = listener.mock.calls.length;
    game.subscribeHud(listener);
    game.dispose();
    game.frame(2000);
    expect(listener.mock.calls.length).toBe(calls);
  });

  it('is the same simulation as the shared one', () => {
    const world = createWorld({ seed: 7, slots: [0, 1, 2] });
    stepWorld(world);
    expect(world.tick).toBe(1);
  });
});
