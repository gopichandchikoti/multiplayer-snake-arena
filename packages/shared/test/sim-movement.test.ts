import { describe, expect, it } from 'vitest';
import {
  AEGIS_TICKS,
  GROWTH,
  MAX_QUEUED_TURNS,
  SCORE,
  START_LENGTH,
  SURGE_TICKS,
  applyInput,
  createWorld,
  drainEvents,
  getSnake,
  pickFreeCell,
  queueTurn,
  stepWorld,
} from '../src';
import { headOf, must, place, quietWorld, stepTimes } from './helpers';

describe('world creation', () => {
  it('spawns every requested seat facing the middle with a full-length body', () => {
    const world = createWorld({ seed: 3, slots: [0, 1, 2, 3] });
    expect(world.snakes).toHaveLength(4);
    for (const snake of world.snakes) {
      expect(snake.alive).toBe(true);
      expect(snake.body).toHaveLength(START_LENGTH);
    }
    expect(world.foods.length).toBeGreaterThanOrEqual(8);
  });

  it('rejects impossible seats', () => {
    for (const slots of [[8], [-1], [1.5], [0, 0]]) {
      expect(() => createWorld({ seed: 1, slots })).toThrow();
    }
  });

  it('lets all eight snakes run straight for ten moves without anyone crashing', () => {
    const world = createWorld({ seed: 11, slots: [0, 1, 2, 3, 4, 5, 6, 7] });
    stepTimes(world, 20);
    expect(world.snakes.every((s) => s.alive)).toBe(true);
    expect(world.result).toBeNull();
  });
});

describe('movement', () => {
  it('moves one cell every second tick', () => {
    const world = createWorld({ seed: 1, slots: [0, 1] });
    const snake = must(getSnake(world, 0));
    expect(headOf(snake)).toEqual([6, 14]);
    stepTimes(world, 1);
    expect(headOf(snake)).toEqual([6, 14]);
    stepTimes(world, 1);
    expect(headOf(snake)).toEqual([7, 14]);
    stepTimes(world, 2);
    expect(headOf(snake)).toEqual([8, 14]);
    expect(snake.body).toHaveLength(START_LENGTH);
  });

  it('moves every tick while surging, and goes back to normal pace afterwards', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    snake.surge = 4;
    stepTimes(world, 3);
    expect(headOf(snake)).toEqual([13, 10]);
    stepTimes(world, 1);
    stepTimes(world, 2);
    expect(headOf(snake)).toEqual([15, 10]);
  });

  it('grows after eating and scores by food kind', () => {
    for (const kind of ['apple', 'golden', 'pellet'] as const) {
      const world = quietWorld([0, 1]);
      const snake = place(
        world,
        0,
        [
          [10, 10],
          [9, 10],
          [8, 10],
          [7, 10],
        ],
        1,
      );
      place(
        world,
        1,
        [
          [10, 20],
          [9, 20],
          [8, 20],
          [7, 20],
        ],
        1,
      ).countdown = 1000;
      world.foods.push({ id: 50, kind, x: 11, y: 10 });
      stepTimes(world, 1);
      expect(snake.score).toBe(SCORE[kind]);
      expect(snake.grow).toBe(GROWTH[kind]);
      expect(world.foods.some((f) => f.id === 50)).toBe(false);
      expect(drainEvents(world)).toContainEqual({ type: 'eat', slot: 0, kind, x: 11, y: 10, points: SCORE[kind] });
      stepTimes(world, 2 * GROWTH[kind]);
      expect(snake.body).toHaveLength(START_LENGTH + GROWTH[kind]);
    }
  });

  it('keeps the board stocked with food', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    world.foods.push({ id: 51, kind: 'apple', x: 11, y: 10 });
    stepTimes(world, 1);
    expect(snake.score).toBe(SCORE.apple);
    expect(world.foods.filter((f) => f.kind !== 'pellet').length).toBeGreaterThanOrEqual(4);
  });

  it('finds the last free cell on a nearly full board, and none when it is full', () => {
    const world = quietWorld([0]);
    const body = [];
    for (let y = 0; y < 28; y++) for (let x = 0; x < 40; x++) if (!(x === 17 && y === 9)) body.push({ x, y });
    must(getSnake(world, 0)).body = body;
    world.foods = [];
    expect(pickFreeCell(world)).toEqual({ x: 17, y: 9 });
    body.push({ x: 17, y: 9 });
    expect(pickFreeCell(world)).toBeNull();
  });
});

describe('power-ups', () => {
  it('surge speeds the snake up immediately', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    world.powerUps.push({ id: 60, kind: 'surge', x: 11, y: 10, expiresAt: 999 });
    stepTimes(world, 1);
    expect(snake.surge).toBe(SURGE_TICKS);
    expect(snake.countdown).toBe(1);
    expect(drainEvents(world)).toContainEqual({ type: 'power', slot: 0, kind: 'surge', x: 11, y: 10 });
  });

  it('aegis is granted for a limited time', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    world.powerUps.push({ id: 61, kind: 'aegis', x: 11, y: 10, expiresAt: 999 });
    stepTimes(world, 1);
    expect(snake.aegis).toBe(AEGIS_TICKS);
  });

  it('trim halves a long snake but never below the starting length', () => {
    const long = quietWorld([0, 1]);
    const a = place(
      long,
      0,
      Array.from({ length: 10 }, (_, i) => [20 - i, 10] as const),
      1,
    );
    place(
      long,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    long.powerUps.push({ id: 62, kind: 'trim', x: 21, y: 10, expiresAt: 999 });
    stepTimes(long, 1);
    expect(a.body).toHaveLength(5);

    const short = quietWorld([0, 1]);
    const b = place(
      short,
      0,
      Array.from({ length: 6 }, (_, i) => [20 - i, 10] as const),
      1,
    );
    place(
      short,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    short.powerUps.push({ id: 63, kind: 'trim', x: 21, y: 10, expiresAt: 999 });
    stepTimes(short, 1);
    expect(b.body).toHaveLength(START_LENGTH);
  });

  it('spawns on schedule away from the walls, caps the count and expires unclaimed ones', () => {
    const world = createWorld({ seed: 5, slots: [0, 1] });
    for (const s of world.snakes) s.countdown = 10_000;
    world.nextPowerUpTick = 1;
    stepTimes(world, 1);
    expect(world.powerUps).toHaveLength(1);
    const first = must(world.powerUps[0]);
    expect(first.x).toBeGreaterThanOrEqual(2);
    expect(first.y).toBeLessThanOrEqual(25);
    expect(drainEvents(world).some((e) => e.type === 'spawn-power')).toBe(true);

    world.nextPowerUpTick = world.tick + 1;
    world.powerUps.push({ id: 700, kind: 'trim', x: 5, y: 5, expiresAt: world.tick + 500 });
    stepTimes(world, 1);
    expect(world.powerUps).toHaveLength(2);

    world.powerUps = world.powerUps.map((p) => ({ ...p, expiresAt: world.tick + 1 }));
    stepTimes(world, 1);
    expect(world.powerUps).toHaveLength(0);
  });
});

describe('input rules', () => {
  it('ignores repeats, rejects reversals and limits the queue', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    expect(queueTurn(snake, 1)).toBe('ignored');
    expect(queueTurn(snake, 3)).toBe('rejected');
    expect(queueTurn(snake, 2)).toBe('accepted');
    expect(queueTurn(snake, 3)).toBe('accepted');
    expect(snake.queue).toHaveLength(MAX_QUEUED_TURNS);
    expect(queueTurn(snake, 0)).toBe('rejected');
  });

  it('plays queued turns on consecutive moves', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 1000;
    applyInput(world, 0, 2);
    applyInput(world, 0, 3);
    stepTimes(world, 1);
    expect(headOf(snake)).toEqual([10, 11]);
    stepTimes(world, 2);
    expect(headOf(snake)).toEqual([9, 11]);
    expect(snake.dir).toBe(3);
    expect(snake.queue).toHaveLength(0);
  });

  it('refuses input for dead snakes, unknown seats and finished rounds', () => {
    const world = quietWorld([0, 1]);
    must(getSnake(world, 0)).alive = false;
    expect(applyInput(world, 0, 0)).toBe('rejected');
    expect(applyInput(world, 5, 0)).toBe('rejected');
    world.result = { reason: 'timer', endedAtTick: 1, winnerSlots: [], standings: [] };
    expect(applyInput(world, 1, 0)).toBe('rejected');
    const tick = world.tick;
    stepWorld(world);
    expect(world.tick).toBe(tick);
  });
});
