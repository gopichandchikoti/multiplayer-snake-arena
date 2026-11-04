import type { Dir } from '@snake/shared';

const KEY_TO_DIR: Readonly<Record<string, Dir>> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

/** Maps a physical key (layout independent) to a heading, or null for any other key. */
export function dirForKey(code: string): Dir | null {
  return KEY_TO_DIR[code] ?? null;
}

/** Minimum finger travel, in CSS pixels, before a swipe counts as a turn. */
export const SWIPE_THRESHOLD = 24;

/** Direction of a drag from (0,0) to (dx,dy), or null while it is shorter than the threshold. */
export function dirForSwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Dir | null {
  // Written so that a NaN (a pointer event without coordinates) is never mistaken for a swipe.
  if (!(Math.max(Math.abs(dx), Math.abs(dy)) >= threshold)) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

export interface SwipeTracker {
  start(x: number, y: number): void;
  move(x: number, y: number): Dir | null;
  end(): void;
}

/**
 * Turns a continuous drag into a series of turns: every time the finger travels far enough the
 * origin resets, so "right, then down" is one unbroken gesture.
 */
export function createSwipeTracker(threshold = SWIPE_THRESHOLD): SwipeTracker {
  let origin: { x: number; y: number } | null = null;
  return {
    start(x, y) {
      origin = { x, y };
    },
    move(x, y) {
      if (!origin) return null;
      const dir = dirForSwipe(x - origin.x, y - origin.y, threshold);
      if (dir !== null) origin = { x, y };
      return dir;
    },
    end() {
      origin = null;
    },
  };
}

/** Whether keyboard shortcuts should be ignored because the user is typing into a field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
