import { GRID_H, GRID_W } from './constants';
import type { Dir, Vec } from './types';

export const DIRS: readonly Dir[] = [0, 1, 2, 3];

const DELTAS: Record<Dir, Vec> = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { 0: 2, 1: 3, 2: 0, 3: 1 };
const LEFT: Record<Dir, Dir> = { 0: 3, 1: 0, 2: 1, 3: 2 };
const RIGHT: Record<Dir, Dir> = { 0: 1, 1: 2, 2: 3, 3: 0 };

export function isDir(value: unknown): value is Dir {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function delta(dir: Dir): Vec {
  return DELTAS[dir];
}

export function opposite(dir: Dir): Dir {
  return OPPOSITE[dir];
}

export function turnLeft(dir: Dir): Dir {
  return LEFT[dir];
}

export function turnRight(dir: Dir): Dir {
  return RIGHT[dir];
}

export function step(from: Vec, dir: Dir): Vec {
  const d = DELTAS[dir];
  return { x: from.x + d.x, y: from.y + d.y };
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

export function cellKey(x: number, y: number): number {
  return y * GRID_W + x;
}

export function manhattan(a: Vec, b: Vec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Direction of the unit step from `a` to the adjacent cell `b`, or null when they are not neighbours. */
export function dirBetween(a: Vec, b: Vec): Dir | null {
  for (const dir of DIRS) {
    const d = DELTAS[dir];
    if (a.x + d.x === b.x && a.y + d.y === b.y) return dir;
  }
  return null;
}
