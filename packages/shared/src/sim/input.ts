import { MAX_QUEUED_TURNS } from '../constants';
import { opposite } from '../geometry';
import type { Dir, SnakeState, WorldState } from '../types';
import { getSnake } from './snake';

export type InputOutcome = 'accepted' | 'ignored' | 'rejected';

/**
 * Queues a turn for the snake in `slot`. Reversing straight into the neck and repeating the
 * current heading are never accepted, and at most MAX_QUEUED_TURNS wait for the next move.
 */
export function queueTurn(snake: SnakeState, dir: Dir): InputOutcome {
  if (!snake.alive) return 'rejected';
  const heading = snake.queue[snake.queue.length - 1] ?? snake.dir;
  if (dir === heading) return 'ignored';
  if (dir === opposite(heading)) return 'rejected';
  if (snake.queue.length >= MAX_QUEUED_TURNS) return 'rejected';
  snake.queue.push(dir);
  return 'accepted';
}

export function applyInput(world: WorldState, slot: number, dir: Dir): InputOutcome {
  if (world.result) return 'rejected';
  const snake = getSnake(world, slot);
  return snake ? queueTurn(snake, dir) : 'rejected';
}
