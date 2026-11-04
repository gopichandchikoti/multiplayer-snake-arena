import {
  AEGIS_STUMBLE_TICKS,
  AEGIS_TICKS,
  GROWTH,
  MOVE_EVERY_SURGE,
  SCORE,
  START_LENGTH,
  SURGE_TICKS,
  TRIM_KEEP_RATIO,
} from '../constants';
import { step as stepCell } from '../geometry';
import type { SnakeState, WorldState } from '../types';
import { type MovePlan, type Resolution, resolveMoves } from './collisions';
import { type Fatality, checkRoundEnd, killSnakes } from './round';
import { cadence, movedBody, requireHead } from './snake';
import { ensureFood, updatePowerUps } from './world';

/** Advances the world by exactly one tick. Does nothing once the round has a result. */
export function stepWorld(world: WorldState): void {
  if (world.result) return;
  world.tick += 1;
  for (const snake of world.snakes) tickEffects(snake);
  const resolution = resolveMoves(world, planMoves(world));
  const fatalities = commitMoves(world, resolution);
  killSnakes(world, fatalities);
  collectPickups(world, resolution.moving);
  updatePowerUps(world);
  ensureFood(world);
  checkRoundEnd(world);
}

export function tickEffects(snake: SnakeState): void {
  if (!snake.alive) return;
  if (snake.surge > 0) snake.surge -= 1;
  if (snake.aegis > 0) snake.aegis -= 1;
}

function planMoves(world: WorldState): MovePlan[] {
  const plans: MovePlan[] = [];
  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    snake.countdown -= 1;
    if (snake.countdown > 0) continue;
    const dir = snake.queue[0] ?? snake.dir;
    plans.push({ snake, dir, head: stepCell(requireHead(snake), dir), grows: snake.grow > 0 });
  }
  return plans;
}

function commitMoves(world: WorldState, resolution: Resolution): Fatality[] {
  for (const plan of resolution.cancelled) stumble(world, plan);
  const fatalities: Fatality[] = [];
  for (const plan of resolution.moving) {
    const collision = resolution.deaths.get(plan.snake.slot);
    if (collision) {
      fatalities.push({ slot: plan.snake.slot, cause: collision.cause, by: collision.by });
      continue;
    }
    advance(plan);
  }
  return fatalities;
}

function stumble(world: WorldState, plan: MovePlan): void {
  const { snake } = plan;
  const head = requireHead(snake);
  snake.queue.shift();
  snake.countdown = AEGIS_STUMBLE_TICKS;
  world.events.push({ type: 'shield-break', slot: snake.slot, x: head.x, y: head.y });
}

export function advance(plan: MovePlan): void {
  const { snake } = plan;
  if (snake.queue.length > 0) snake.queue.shift();
  snake.dir = plan.dir;
  snake.body = movedBody(snake, plan.head, plan.grows);
  if (plan.grows) snake.grow -= 1;
  snake.countdown = cadence(snake);
}

function collectPickups(world: WorldState, moved: readonly MovePlan[]): void {
  for (const plan of moved) {
    const snake = plan.snake;
    if (!snake.alive) continue;
    const head = requireHead(snake);
    const foodAt = world.foods.findIndex((f) => f.x === head.x && f.y === head.y);
    const food = world.foods[foodAt];
    if (food) {
      world.foods.splice(foodAt, 1);
      snake.score += SCORE[food.kind];
      snake.grow += GROWTH[food.kind];
      world.events.push({
        type: 'eat',
        slot: snake.slot,
        kind: food.kind,
        x: head.x,
        y: head.y,
        points: SCORE[food.kind],
      });
    }
    const powerAt = world.powerUps.findIndex((p) => p.x === head.x && p.y === head.y);
    const power = world.powerUps[powerAt];
    if (power) {
      world.powerUps.splice(powerAt, 1);
      applyPowerUp(snake, power.kind);
      world.events.push({ type: 'power', slot: snake.slot, kind: power.kind, x: head.x, y: head.y });
    }
  }
}

function applyPowerUp(snake: SnakeState, kind: 'surge' | 'aegis' | 'trim'): void {
  if (kind === 'surge') {
    snake.surge = SURGE_TICKS;
    snake.countdown = Math.min(snake.countdown, MOVE_EVERY_SURGE);
  } else if (kind === 'aegis') {
    snake.aegis = AEGIS_TICKS;
  } else {
    const keep = Math.max(START_LENGTH, Math.ceil(snake.body.length * TRIM_KEEP_RATIO));
    snake.body = snake.body.slice(0, keep);
    snake.grow = 0;
  }
}
