import { MOVE_EVERY, MOVE_EVERY_SURGE } from '../constants';
import type { SnakeState, Vec, WorldState } from '../types';

export function cadence(snake: SnakeState): number {
  return snake.surge > 0 ? MOVE_EVERY_SURGE : MOVE_EVERY;
}

export function requireHead(snake: SnakeState): Vec {
  const head = snake.body[0];
  if (!head) throw new Error(`snake ${snake.slot} has no body`);
  return head;
}

export function getSnake(world: WorldState, slot: number): SnakeState | undefined {
  return world.snakes.find((s) => s.slot === slot);
}

export function aliveSnakes(world: WorldState): SnakeState[] {
  return world.snakes.filter((s) => s.alive);
}

/** The body after moving the head to `head`; the tail stays put while the snake is still growing. */
export function movedBody(snake: SnakeState, head: Vec, grows: boolean): Vec[] {
  return [head, ...(grows ? snake.body : snake.body.slice(0, -1))];
}
