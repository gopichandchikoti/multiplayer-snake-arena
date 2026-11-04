import { GRID_H, GRID_W, type Dir, type Vec } from '@snake/shared';

/**
 * Where the arena sits on screen. On a tall, narrow screen the arena is turned a quarter turn so
 * its long side runs down the screen and cells stay big enough to read and steer.
 */
export interface Layout {
  /** Cell edge in device pixels. */
  cell: number;
  originX: number;
  originY: number;
  rotated: boolean;
  /** Arena size on screen, in cells. */
  cols: number;
  rows: number;
}

export function computeLayout(width: number, height: number, margin = 0): Layout {
  const w = Math.max(1, width - margin * 2);
  const h = Math.max(1, height - margin * 2);
  const upright = Math.min(w / GRID_W, h / GRID_H);
  const turned = Math.min(w / GRID_H, h / GRID_W);
  const rotated = turned > upright;
  const cols = rotated ? GRID_H : GRID_W;
  const rows = rotated ? GRID_W : GRID_H;
  const cell = Math.max(1, Math.floor(rotated ? turned : upright));
  return {
    cell,
    originX: Math.floor((width - cols * cell) / 2),
    originY: Math.floor((height - rows * cell) / 2),
    rotated,
    cols,
    rows,
  };
}

/** Screen-pixel centre of a (possibly fractional) arena cell, given in cell-centre units. */
export function cellToPixel(layout: Layout, p: Vec): Vec {
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  const sx = layout.rotated ? GRID_H - cy : cx;
  const sy = layout.rotated ? cx : cy;
  return { x: layout.originX + sx * layout.cell, y: layout.originY + sy * layout.cell };
}

const SCREEN_TO_WORLD_TURNED: Record<Dir, Dir> = { 0: 3, 1: 0, 2: 1, 3: 2 };
const WORLD_TO_SCREEN_TURNED: Record<Dir, Dir> = { 3: 0, 0: 1, 1: 2, 2: 3 };

/** A swipe or button press is in screen terms; the simulation thinks in arena terms. */
export function screenDirToWorld(layout: Pick<Layout, 'rotated'>, dir: Dir): Dir {
  return layout.rotated ? SCREEN_TO_WORLD_TURNED[dir] : dir;
}

export function worldDirToScreen(layout: Pick<Layout, 'rotated'>, dir: Dir): Dir {
  return layout.rotated ? WORLD_TO_SCREEN_TURNED[dir] : dir;
}

/** Rotation in radians for a sprite drawn pointing right (+x). */
export function angleForDir(dir: Dir): number {
  return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir] ?? 0;
}

/** Whether to show the on-screen steering pad: forced on/off, or automatic for touch-first devices. */
export function shouldShowDpad(mode: 'auto' | 'on' | 'off', coarsePointer: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && coarsePointer);
}
