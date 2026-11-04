import {
  FOOD_MIN,
  FOOD_PER_PLAYER,
  GOLDEN_ONE_IN,
  GRID_H,
  GRID_W,
  MAX_PLAYERS,
  MOVE_EVERY,
  POWERUP_FIRST_TICK,
  POWERUP_INTERVAL_TICKS,
  POWERUP_LIFETIME_TICKS,
  POWERUP_MARGIN,
  POWERUP_MAX_ON_BOARD,
  ROUND_TICKS,
  START_LENGTH,
} from '../constants';
import { cellKey, delta, opposite } from '../geometry';
import { nextFloat } from '../rng';
import type { Dir, GameEvent, PowerUpKind, SnakeState, Vec, WorldState } from '../types';
import { aliveSnakes } from './snake';

export interface WorldConfig {
  seed: number;
  /** Seats taking part, each 0..7. A slot always starts from the same place on the board. */
  slots: readonly number[];
  roundTicks?: number;
}

interface Spawn {
  x: number;
  y: number;
  dir: Dir;
}

/** Pairs 0/1, 2/3, 4/5 and 6/7 are 180 degree rotations of each other, so no seat has an edge. */
export const SPAWNS: readonly Spawn[] = [
  { x: 6, y: 14, dir: 1 },
  { x: 33, y: 13, dir: 3 },
  { x: 20, y: 5, dir: 2 },
  { x: 19, y: 22, dir: 0 },
  { x: 8, y: 7, dir: 1 },
  { x: 31, y: 20, dir: 3 },
  { x: 32, y: 6, dir: 2 },
  { x: 7, y: 21, dir: 0 },
];

export function createWorld(config: WorldConfig): WorldState {
  const world: WorldState = {
    tick: 0,
    rng: config.seed | 0,
    nextId: 1,
    snakes: [],
    foods: [],
    powerUps: [],
    endsAtTick: config.roundTicks ?? ROUND_TICKS,
    nextPowerUpTick: POWERUP_FIRST_TICK,
    events: [],
    result: null,
  };
  const seen = new Set<number>();
  for (const slot of config.slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) throw new Error(`invalid slot ${slot}`);
    if (seen.has(slot)) throw new Error(`duplicate slot ${slot}`);
    seen.add(slot);
    world.snakes.push(spawnSnake(slot));
  }
  ensureFood(world);
  return world;
}

function spawnSnake(slot: number): SnakeState {
  const spawn = SPAWNS[slot];
  if (!spawn) throw new Error(`no spawn for slot ${slot}`);
  const back = delta(opposite(spawn.dir));
  const body: Vec[] = [];
  for (let i = 0; i < START_LENGTH; i++) body.push({ x: spawn.x + back.x * i, y: spawn.y + back.y * i });
  return {
    slot,
    alive: true,
    dir: spawn.dir,
    queue: [],
    body,
    grow: 0,
    countdown: MOVE_EVERY,
    score: 0,
    kills: 0,
    surge: 0,
    aegis: 0,
    deathTick: null,
    finalLength: START_LENGTH,
  };
}

export function randInt(world: WorldState, maxExclusive: number): number {
  const r = nextFloat(world.rng);
  world.rng = r.state;
  return Math.floor(r.value * maxExclusive);
}

export function occupiedCells(world: WorldState): Set<number> {
  const taken = new Set<number>();
  for (const s of world.snakes) for (const c of s.body) taken.add(cellKey(c.x, c.y));
  for (const f of world.foods) taken.add(cellKey(f.x, f.y));
  for (const p of world.powerUps) taken.add(cellKey(p.x, p.y));
  return taken;
}

/** A random empty cell at least `margin` cells from every wall, or null when the board is full. */
export function pickFreeCell(world: WorldState, margin = 0): Vec | null {
  const taken = occupiedCells(world);
  const w = GRID_W - 2 * margin;
  const h = GRID_H - 2 * margin;
  for (let attempt = 0; attempt < 48; attempt++) {
    const x = margin + randInt(world, w);
    const y = margin + randInt(world, h);
    if (!taken.has(cellKey(x, y))) return { x, y };
  }
  const free: Vec[] = [];
  for (let y = margin; y < GRID_H - margin; y++) {
    for (let x = margin; x < GRID_W - margin; x++) if (!taken.has(cellKey(x, y))) free.push({ x, y });
  }
  return free[randInt(world, free.length)] ?? null;
}

export function ensureFood(world: WorldState): void {
  const target = Math.max(FOOD_MIN, FOOD_PER_PLAYER * aliveSnakes(world).length);
  let count = world.foods.filter((f) => f.kind !== 'pellet').length;
  while (count < target) {
    const cell = pickFreeCell(world);
    if (!cell) return;
    const kind = randInt(world, GOLDEN_ONE_IN) === 0 ? 'golden' : 'apple';
    world.foods.push({ id: world.nextId++, kind, x: cell.x, y: cell.y });
    count += 1;
  }
}

const POWERUP_WEIGHTS: ReadonlyArray<readonly [PowerUpKind, number]> = [
  ['surge', 3],
  ['aegis', 2],
  ['trim', 2],
];

function pickPowerUpKind(world: WorldState): PowerUpKind {
  let roll = randInt(
    world,
    POWERUP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0),
  );
  for (const [kind, weight] of POWERUP_WEIGHTS) {
    if (roll < weight) return kind;
    roll -= weight;
  }
  return 'surge';
}

export function updatePowerUps(world: WorldState): void {
  world.powerUps = world.powerUps.filter((p) => p.expiresAt > world.tick);
  if (world.tick < world.nextPowerUpTick) return;
  world.nextPowerUpTick = world.tick + POWERUP_INTERVAL_TICKS;
  if (world.powerUps.length >= POWERUP_MAX_ON_BOARD) return;
  const cell = pickFreeCell(world, POWERUP_MARGIN);
  if (!cell) return;
  const kind = pickPowerUpKind(world);
  const expiresAt = world.tick + POWERUP_LIFETIME_TICKS;
  world.powerUps.push({ id: world.nextId++, kind, x: cell.x, y: cell.y, expiresAt });
  world.events.push({ type: 'spawn-power', kind, x: cell.x, y: cell.y });
}

/** Hands the events produced since the last call to the caller and clears them. */
export function drainEvents(world: WorldState): GameEvent[] {
  const events = world.events;
  world.events = [];
  return events;
}
