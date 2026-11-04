import { GROWTH } from './constants';
import { inBounds, step as stepCell } from './geometry';
import { queueTurn } from './sim/input';
import { movedBody, requireHead } from './sim/snake';
import { advance, tickEffects } from './sim/step';
import type { Dir, FoodItem, SnakeState } from './types';

export interface PendingInput {
  seq: number;
  dir: Dir;
  /** Tick, in server numbering, at which the input is expected to take effect. */
  applyTick: number;
}

export function cloneSnake(snake: SnakeState): SnakeState {
  return { ...snake, queue: [...snake.queue], body: [...snake.body] };
}

/**
 * Moves one snake a single tick on its own, using the same helpers as the real step. It cannot know
 * about other snakes, so it only refuses moves that are fatal on their own (wall, own body).
 * Returns false when the snake should stay put until the server says what happened.
 */
export function moveAlone(snake: SnakeState, foods: readonly FoodItem[]): boolean {
  tickEffects(snake);
  snake.countdown -= 1;
  if (snake.countdown > 0) return true;
  const dir = snake.queue[0] ?? snake.dir;
  const head = stepCell(requireHead(snake), dir);
  const grows = snake.grow > 0;
  const hitsSelf = movedBody(snake, head, grows)
    .slice(1)
    .some((cell) => cell.x === head.x && cell.y === head.y);
  if (!inBounds(head.x, head.y) || hitsSelf) {
    snake.countdown = 1;
    return false;
  }
  advance({ snake, dir, head, grows });
  const food = foods.find((f) => f.x === head.x && f.y === head.y);
  if (food) snake.grow += GROWTH[food.kind];
  return true;
}

export interface PredictionContext {
  foods: readonly FoodItem[];
  pending: readonly PendingInput[];
  /** Tick of `base`. */
  fromTick: number;
  toTick: number;
}

/**
 * Replays the not-yet-acknowledged inputs on top of the last authoritative state of the local snake
 * and runs it forward to `toTick`. This is what the player sees for their own snake.
 */
export function predictSnake(base: SnakeState, context: PredictionContext): SnakeState {
  const { foods, pending, fromTick, toTick } = context;
  const snake = cloneSnake(base);
  const inputs = [...pending].sort((a, b) => a.seq - b.seq);
  let next = 0;
  for (let tick = fromTick + 1; tick <= toTick && snake.alive; tick++) {
    for (let input = inputs[next]; input && input.applyTick <= tick; input = inputs[++next]) {
      queueTurn(snake, input.dir);
    }
    if (!moveAlone(snake, foods)) break;
  }
  return snake;
}
