import { createWorld, getSnake, stepWorld } from '../src';
import type { Dir, GameEvent, SnakeState, WorldState } from '../src';

export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}

/** A world whose random food and power-ups cannot wander into a hand-built scenario. */
export function quietWorld(slots: readonly number[], seed = 1): WorldState {
  const world = createWorld({ seed, slots });
  world.foods = [
    { id: 900, kind: 'apple', x: 0, y: 0 },
    { id: 901, kind: 'apple', x: 39, y: 0 },
    { id: 902, kind: 'apple', x: 0, y: 27 },
    { id: 903, kind: 'apple', x: 39, y: 27 },
  ];
  world.nextPowerUpTick = Number.MAX_SAFE_INTEGER;
  return world;
}

/** Puts a snake on explicit cells (head first) so that it moves on the very next tick. */
export function place(world: WorldState, slot: number, cells: ReadonlyArray<readonly [number, number]>, dir: Dir) {
  const snake = must(getSnake(world, slot));
  snake.body = cells.map(([x, y]) => ({ x, y }));
  snake.dir = dir;
  snake.queue = [];
  snake.countdown = 1;
  snake.grow = 0;
  return snake;
}

export function stepTimes(world: WorldState, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepWorld(world);
}

export function headOf(snake: SnakeState): [number, number] {
  const head = must(snake.body[0]);
  return [head.x, head.y];
}

export type Cells = ReadonlyArray<readonly [number, number]>;

/** Two snakes on explicit cells plus a parked third so the round does not end on the first crash. */
export function duel(a: [Cells, Dir], b: [Cells, Dir], reverseOrder = false): WorldState {
  const world = quietWorld([0, 1, 2]);
  place(world, 0, a[0], a[1]);
  place(world, 1, b[0], b[1]);
  place(
    world,
    2,
    [
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
    ],
    0,
  ).countdown = 100_000;
  if (reverseOrder) world.snakes.reverse();
  return world;
}

export const deathOf = (events: GameEvent[], slot: number) => events.find((e) => e.type === 'die' && e.slot === slot);
