import { GRID_H, GRID_W } from './constants';
import { cellKey, inBounds, manhattan, step, turnLeft, turnRight } from './geometry';
import { Rng } from './rng';
import { aliveSnakes, getSnake, requireHead } from './sim/snake';
import type { Dir, Vec, WorldState } from './types';

export type BotLevel = 'easy' | 'normal' | 'hard';

interface Personality {
  /** Chance per decision of ignoring safety and picking at random. */
  blunder: number;
  /** Chance per decision of not reacting at all this move. */
  dawdle: number;
}

const PERSONALITIES: Record<BotLevel, Personality> = {
  easy: { blunder: 0.12, dawdle: 0.2 },
  normal: { blunder: 0.04, dawdle: 0.06 },
  hard: { blunder: 0.005, dawdle: 0 },
};

export interface BotBrain {
  slot: number;
  level: BotLevel;
  rng: Rng;
}

export function createBot(slot: number, level: BotLevel, seed: number): BotBrain {
  return { slot, level, rng: new Rng(seed ^ (slot * 7919)) };
}

/** Cells a head cannot enter next move: every body cell, except tails that are about to move away. */
function blockedCells(world: WorldState): Set<number> {
  const blocked = new Set<number>();
  for (const snake of aliveSnakes(world)) {
    const keep = snake.grow === 0 && snake.countdown <= 1 ? snake.body.length - 1 : snake.body.length;
    for (let i = 0; i < keep; i++) {
      const cell = snake.body[i];
      if (cell) blocked.add(cellKey(cell.x, cell.y));
    }
  }
  return blocked;
}

/** Number of free cells reachable from `from`, counted up to `limit`. */
function reachableArea(from: Vec, blocked: ReadonlySet<number>, limit: number): number {
  const seen = new Set<number>([cellKey(from.x, from.y)]);
  const frontier: Vec[] = [from];
  for (let i = 0; i < frontier.length && seen.size < limit; i++) {
    const cell = frontier[i];
    if (!cell) break;
    for (const dir of [0, 1, 2, 3] as const) {
      const next = step(cell, dir);
      const key = cellKey(next.x, next.y);
      if (!inBounds(next.x, next.y) || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      frontier.push(next);
    }
  }
  return seen.size;
}

function nearestTarget(world: WorldState, from: Vec): Vec | null {
  let best: Vec | null = null;
  let bestScore = Infinity;
  const consider = (cell: Vec, bonus: number): void => {
    const score = manhattan(from, cell) - bonus;
    if (score < bestScore) {
      best = cell;
      bestScore = score;
    }
  };
  for (const food of world.foods) consider(food, food.kind === 'golden' ? 4 : 0);
  for (const power of world.powerUps) consider(power, power.kind === 'trim' ? -6 : 3);
  return best;
}

interface Scene {
  world: WorldState;
  blocked: ReadonlySet<number>;
  length: number;
}

function rate(scene: Scene, from: Vec, dir: Dir): number {
  const { world, blocked, length } = scene;
  const next = step(from, dir);
  if (!inBounds(next.x, next.y) || blocked.has(cellKey(next.x, next.y))) return -Infinity;
  const area = reachableArea(next, blocked, Math.max(40, length * 3));
  const trapped = area < length ? -500 + area : 0;
  const target = nearestTarget(world, next);
  const approach = target ? -manhattan(next, target) : 0;
  const edge = Math.min(next.x, next.y, GRID_W - 1 - next.x, GRID_H - 1 - next.y) < 2 ? -2 : 0;
  return trapped + approach + edge;
}

/**
 * Returns the turn this bot wants to queue now, or null to carry on. Bots only think on the tick
 * before their snake moves and never queue more than one turn, like a player with a fast finger.
 */
export function botThink(world: WorldState, bot: BotBrain): Dir | null {
  const snake = getSnake(world, bot.slot);
  if (!snake?.alive || snake.countdown > 1 || snake.queue.length > 0) return null;
  const personality = PERSONALITIES[bot.level];
  if (bot.rng.float() < personality.dawdle) return null;
  const options: Dir[] = [snake.dir, turnLeft(snake.dir), turnRight(snake.dir)];
  const choice =
    bot.rng.float() < personality.blunder
      ? options[bot.rng.int(options.length)]
      : bestOption(bot, options, { world, blocked: blockedCells(world), length: snake.body.length }, snake.dir);
  return choice === undefined || choice === snake.dir ? null : choice;
}

function bestOption(bot: BotBrain, options: readonly Dir[], scene: Scene, fallback: Dir): Dir {
  const snake = getSnake(scene.world, bot.slot);
  if (!snake) return fallback;
  const head = requireHead(snake);
  let best = fallback;
  let bestScore = -Infinity;
  for (const dir of options) {
    const score = rate(scene, head, dir) + bot.rng.float() * 0.5;
    if (score > bestScore) {
      best = dir;
      bestScore = score;
    }
  }
  return best;
}
