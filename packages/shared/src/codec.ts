import { DIRS, delta, dirBetween, inBounds } from './geometry';
import type { Dir, Vec } from './types';

/**
 * A snake body is a chain of adjacent cells, so it travels as the head cell plus one character per
 * following segment ('0'..'3' = the direction from the previous cell). 100 segments cost 100 bytes.
 */
export function encodePath(cells: readonly Vec[]): string {
  let out = '';
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (!prev || !cur) throw new Error('encodePath: sparse cell list');
    const dir = dirBetween(prev, cur);
    if (dir === null) throw new Error(`encodePath: cells ${i - 1} and ${i} are not adjacent`);
    out += String(dir);
  }
  return out;
}

/** Inverse of encodePath. Returns null for a malformed or out-of-arena path instead of throwing. */
export function decodePath(head: readonly [number, number], path: string): Vec[] | null {
  if (!inBounds(head[0], head[1])) return null;
  const cells: Vec[] = [{ x: head[0], y: head[1] }];
  let cursor: Vec = { x: head[0], y: head[1] };
  for (const ch of path) {
    const dir = parseDir(ch);
    if (dir === null) return null;
    const d = delta(dir);
    cursor = { x: cursor.x + d.x, y: cursor.y + d.y };
    if (!inBounds(cursor.x, cursor.y)) return null;
    cells.push(cursor);
  }
  return cells;
}

function parseDir(ch: string): Dir | null {
  for (const dir of DIRS) {
    if (String(dir) === ch) return dir;
  }
  return null;
}
