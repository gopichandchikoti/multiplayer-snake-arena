import { describe, expect, it } from 'vitest';
import {
  GRID_W,
  applyInput,
  botThink,
  cloneSnake,
  createBot,
  createWorld,
  getSnake,
  moveAlone,
  predictSnake,
  queueTurn,
  stepWorld,
} from '../src';
import type { BotLevel, Dir, PendingInput } from '../src';
import { headOf, must, place, quietWorld } from './helpers';

describe('client prediction', () => {
  function lap(): { world: ReturnType<typeof quietWorld>; script: Array<[number, Dir]> } {
    const world = quietWorld([0]);
    place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    ).countdown = 2;
    world.foods.push({ id: 70, kind: 'apple', x: 11, y: 12 });
    return {
      world,
      script: [
        [3, 2],
        [9, 3],
        [13, 0],
        [17, 1],
        [23, 2],
      ],
    };
  }

  it('matches the authoritative snake exactly when nothing outside the snake interferes', () => {
    const { world, script } = lap();
    const base = cloneSnake(must(getSnake(world, 0)));
    const foods = world.foods.map((f) => ({ ...f }));
    const pending: PendingInput[] = [];
    script.forEach(([tick, dir], i) => pending.push({ seq: i + 1, dir, applyTick: tick + 1 }));
    for (let tick = 0; tick < 40; tick++) {
      for (const [at, dir] of script) if (at === tick) applyInput(world, 0, dir);
      stepWorld(world);
    }
    const predicted = predictSnake(base, { foods: foods, pending: pending, fromTick: 0, toTick: 40 });
    const real = must(getSnake(world, 0));
    expect(real.score).toBe(10);
    expect(real.body).toHaveLength(5);
    expect(predicted.body).toEqual(real.body);
    expect(predicted.dir).toBe(real.dir);
    expect(predicted.countdown).toBe(real.countdown);
    expect(predicted.queue).toEqual(real.queue);
  });

  it('replays pending inputs on top of the base state', () => {
    const world = quietWorld([0]);
    const base = cloneSnake(
      place(
        world,
        0,
        [
          [10, 10],
          [9, 10],
          [8, 10],
          [7, 10],
        ],
        1,
      ),
    );
    base.countdown = 2;
    const pending: PendingInput[] = [{ seq: 4, dir: 2, applyTick: 1 }];
    const predicted = predictSnake(base, { foods: [], pending: pending, fromTick: 0, toTick: 2 });
    expect(headOf(predicted)).toEqual([10, 11]);
    expect(headOf(predictSnake(base, { foods: [], pending: [], fromTick: 0, toTick: 2 }))).toEqual([11, 10]);
  });

  it('does not apply an input before its tick, and applies late ones in seq order', () => {
    const world = quietWorld([0]);
    const base = cloneSnake(
      place(
        world,
        0,
        [
          [10, 10],
          [9, 10],
          [8, 10],
          [7, 10],
        ],
        1,
      ),
    );
    base.countdown = 2;
    const pending: PendingInput[] = [
      { seq: 2, dir: 3, applyTick: 2 },
      { seq: 1, dir: 2, applyTick: 2 },
    ];
    const early = predictSnake(base, { foods: [], pending: pending, fromTick: 0, toTick: 1 });
    expect(early.queue).toEqual([]);
    // Sorted by seq the turns are down then left (both legal); in arrival order "left" would be a reversal.
    const later = predictSnake(base, { foods: [], pending: pending, fromTick: 0, toTick: 4 });
    expect(headOf(later)).toEqual([9, 11]);
    expect(later.dir).toBe(3);
  });

  it('stops at a fatal move instead of running through the wall', () => {
    const world = quietWorld([0]);
    const base = cloneSnake(
      place(
        world,
        0,
        [
          [GRID_W - 1, 10],
          [GRID_W - 2, 10],
          [GRID_W - 3, 10],
          [GRID_W - 4, 10],
        ],
        1,
      ),
    );
    const predicted = predictSnake(base, { foods: [], pending: [], fromTick: 0, toTick: 20 });
    expect(headOf(predicted)).toEqual([GRID_W - 1, 10]);
    expect(predicted.alive).toBe(true);
  });

  it('stops before biting its own body', () => {
    const snake = place(
      quietWorld([0]),
      0,
      [
        [5, 5],
        [5, 6],
        [6, 6],
        [6, 5],
        [6, 4],
      ],
      1,
    );
    expect(moveAlone(snake, [])).toBe(false);
    expect(headOf(snake)).toEqual([5, 5]);
  });

  it('grows when the predicted head meets food', () => {
    const snake = place(
      quietWorld([0]),
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    expect(moveAlone(snake, [{ id: 1, kind: 'golden', x: 11, y: 10 }])).toBe(true);
    expect(snake.grow).toBe(3);
  });
});

function simulate(level: BotLevel | 'idle', seed: number, ticks: number): number {
  const world = createWorld({ seed, slots: [0, 1, 2, 3] });
  const bots = level === 'idle' ? [] : world.snakes.map((s) => createBot(s.slot, level, seed));
  let lifeTicks = 0;
  for (let t = 0; t < ticks; t++) {
    for (const bot of bots) {
      const turn = botThink(world, bot);
      if (turn !== null) expect(['accepted']).toContain(queueTurn(must(getSnake(world, bot.slot)), turn));
    }
    stepWorld(world);
    lifeTicks += world.snakes.filter((s) => s.alive).length;
    if (world.result) break;
  }
  return lifeTicks;
}

describe('bots', () => {
  it('only ever ask for legal turns', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) simulate(level, 21, 300);
  });

  it('outlive snakes that never steer', () => {
    const idle = simulate('idle', 5, 600);
    expect(simulate('hard', 5, 600)).toBeGreaterThan(idle * 2);
    expect(simulate('normal', 5, 600)).toBeGreaterThan(idle * 1.5);
  });

  it('decide the same way for the same seed', () => {
    expect(simulate('normal', 77, 400)).toBe(simulate('normal', 77, 400));
  });

  it('stay quiet when dead, mid-turn, or not about to move', () => {
    const world = createWorld({ seed: 3, slots: [0, 1] });
    const bot = createBot(0, 'hard', 3);
    const snake = must(getSnake(world, 0));
    snake.countdown = 2;
    expect(botThink(world, bot)).toBeNull();
    snake.countdown = 1;
    snake.queue = [2];
    expect(botThink(world, bot)).toBeNull();
    snake.queue = [];
    snake.alive = false;
    expect(botThink(world, bot)).toBeNull();
    expect(botThink(world, createBot(5, 'hard', 3))).toBeNull();
  });

  it('turn away from a wall they are about to hit', () => {
    const world = quietWorld([0, 1]);
    place(
      world,
      0,
      [
        [GRID_W - 1, 10],
        [GRID_W - 2, 10],
        [GRID_W - 3, 10],
        [GRID_W - 4, 10],
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
    ).countdown = 100_000;
    const turn = botThink(world, createBot(0, 'hard', 1));
    expect(turn === 0 || turn === 2).toBe(true);
  });
});
