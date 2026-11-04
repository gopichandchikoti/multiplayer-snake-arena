import { describe, expect, it } from 'vitest';
import {
  DIRS,
  GRID_H,
  GRID_W,
  Rng,
  cellKey,
  decodePath,
  delta,
  dirBetween,
  encodePath,
  hashSeed,
  inBounds,
  isDir,
  manhattan,
  opposite,
  step,
  turnLeft,
  turnRight,
} from '../src';

describe('geometry', () => {
  it('knows the four headings and rejects everything else', () => {
    expect(DIRS.every(isDir)).toBe(true);
    for (const bad of [4, -1, 1.5, '1', null, undefined, NaN]) expect(isDir(bad)).toBe(false);
  });

  it('turns and reverses consistently', () => {
    for (const dir of DIRS) {
      expect(opposite(opposite(dir))).toBe(dir);
      expect(turnLeft(turnRight(dir))).toBe(dir);
      expect(turnRight(turnRight(dir))).toBe(opposite(dir));
      const d = delta(dir);
      const o = delta(opposite(dir));
      expect([d.x + o.x, d.y + o.y]).toEqual([0, 0]);
    }
  });

  it('steps one cell and measures bounds, keys and distance', () => {
    expect(step({ x: 3, y: 3 }, 0)).toEqual({ x: 3, y: 2 });
    expect(step({ x: 3, y: 3 }, 1)).toEqual({ x: 4, y: 3 });
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(GRID_W - 1, GRID_H - 1)).toBe(true);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [GRID_W, 0],
      [0, GRID_H],
    ] as const)
      expect(inBounds(x, y)).toBe(false);
    const keys = new Set<number>();
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) keys.add(cellKey(x, y));
    expect(keys.size).toBe(GRID_W * GRID_H);
    expect(manhattan({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(7);
  });

  it('finds the direction between neighbours only', () => {
    expect(dirBetween({ x: 5, y: 5 }, { x: 5, y: 4 })).toBe(0);
    expect(dirBetween({ x: 5, y: 5 }, { x: 4, y: 5 })).toBe(3);
    expect(dirBetween({ x: 5, y: 5 }, { x: 6, y: 6 })).toBeNull();
    expect(dirBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('path codec', () => {
  it('round-trips random walks', () => {
    const rng = new Rng(7);
    for (let n = 0; n < 200; n++) {
      const cells = [{ x: 10 + rng.int(20), y: 8 + rng.int(12) }];
      for (let i = 0; i < rng.int(60); i++) {
        const last = cells[cells.length - 1];
        if (!last) break;
        const next = step(last, DIRS[rng.int(4)] ?? 0);
        if (inBounds(next.x, next.y)) cells.push(next);
      }
      const head = cells[0];
      expect(head).toBeDefined();
      expect(decodePath([head?.x ?? 0, head?.y ?? 0], encodePath(cells))).toEqual(cells);
    }
  });

  it('encodes a single cell as an empty path', () => {
    expect(encodePath([{ x: 1, y: 1 }])).toBe('');
    expect(decodePath([1, 1], '')).toEqual([{ x: 1, y: 1 }]);
  });

  it('refuses cells that are not a chain', () => {
    expect(() =>
      encodePath([
        { x: 1, y: 1 },
        { x: 3, y: 1 },
      ]),
    ).toThrow(/not adjacent/);
  });

  it('returns null for malformed or out-of-arena input', () => {
    expect(decodePath([0, 0], '3')).toBeNull();
    expect(decodePath([0, 0], '0')).toBeNull();
    expect(decodePath([5, 5], '12x')).toBeNull();
    expect(decodePath([GRID_W, 0], '')).toBeNull();
    expect(decodePath([-1, 0], '')).toBeNull();
  });
});

describe('rng', () => {
  it('repeats exactly for a seed and differs between seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 20 }, () => a.float());
    expect(Array.from({ length: 20 }, () => b.float())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.float())).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('draws integers inside the range and spreads over it', () => {
    const rng = new Rng(99);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 6000; i++) {
      const value = rng.int(6);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    expect(Math.min(...counts)).toBeGreaterThan(800);
    expect(Math.max(...counts)).toBeLessThan(1200);
  });

  it('hashes text to a stable unsigned seed', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    expect(hashSeed('')).toBeGreaterThanOrEqual(0);
  });
});
