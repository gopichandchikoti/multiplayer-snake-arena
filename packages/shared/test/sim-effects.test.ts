import { describe, expect, it } from 'vitest';
import { AEGIS_STUMBLE_TICKS, PELLET_CAP, drainEvents, getSnake } from '../src';
import { duel, headOf, must, place, quietWorld, stepTimes } from './helpers';

describe('aegis', () => {
  it('turns a fatal move into a stumble and spends the shield', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [39, 10],
        [38, 10],
        [37, 10],
        [36, 10],
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
    snake.aegis = 50;
    snake.queue = [];
    stepTimes(world, 1);
    expect(snake.alive).toBe(true);
    expect(snake.aegis).toBe(0);
    expect(snake.countdown).toBe(AEGIS_STUMBLE_TICKS);
    expect(headOf(snake)).toEqual([39, 10]);
    expect(drainEvents(world)).toContainEqual({ type: 'shield-break', slot: 0, x: 39, y: 10 });
    stepTimes(world, AEGIS_STUMBLE_TICKS - 1);
    expect(snake.alive).toBe(true);
    stepTimes(world, 1);
    expect(snake.alive).toBe(false);
  });

  it('gives the player time to steer away after the stumble', () => {
    const world = quietWorld([0, 1]);
    const snake = place(
      world,
      0,
      [
        [39, 10],
        [38, 10],
        [37, 10],
        [36, 10],
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
    snake.aegis = 50;
    stepTimes(world, 1);
    snake.queue.push(2);
    stepTimes(world, AEGIS_STUMBLE_TICKS);
    expect(snake.alive).toBe(true);
    expect(headOf(snake)).toEqual([39, 11]);
  });

  it('lets the other snake of a head-on crash survive when only one is shielded', () => {
    const world = duel(
      [
        [
          [9, 10],
          [8, 10],
          [7, 10],
          [6, 10],
        ],
        1,
      ],
      [
        [
          [11, 10],
          [12, 10],
          [13, 10],
          [14, 10],
        ],
        3,
      ],
    );
    must(getSnake(world, 0)).aegis = 30;
    stepTimes(world, 1);
    expect(must(getSnake(world, 0)).alive).toBe(true);
    expect(must(getSnake(world, 1)).alive).toBe(true);
    expect(headOf(must(getSnake(world, 1)))).toEqual([10, 10]);
  });
});

describe('dropped pellets', () => {
  it('leaves a pellet on every third segment, capped, never on an occupied cell', () => {
    const world = quietWorld([0, 1]);
    const cells = Array.from({ length: 9 }, (_, i) => [39 - i, 10] as const);
    place(world, 0, cells, 1);
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
    world.foods.push({ id: 80, kind: 'apple', x: 34, y: 10 });
    stepTimes(world, 1);
    const pellets = world.foods.filter((f) => f.kind === 'pellet');
    expect(pellets.map((p) => [p.x, p.y])).toEqual([
      [37, 10],
      [31, 10],
    ]);
  });

  it('never drops more than the cap', () => {
    const world = quietWorld([0, 1]);
    place(
      world,
      0,
      Array.from({ length: 39 }, (_, i) => [39 - i, 10] as const),
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
    stepTimes(world, 1);
    expect(world.foods.filter((f) => f.kind === 'pellet')).toHaveLength(PELLET_CAP);
  });
});
