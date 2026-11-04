import { MOVE_EVERY, MOVE_EVERY_SURGE, TICK_MS, type Dir, type SnakeState, type Vec } from '@snake/shared';

/** A snake as it is drawn: cell-centre coordinates in cell units (floats while moving). */
export interface DisplaySnake {
  slot: number;
  alive: boolean;
  dir: Dir;
  points: Vec[];
  surge: boolean;
  aegis: boolean;
  score: number;
}

interface Track {
  prev: Vec[];
  curr: Vec[];
  startedAt: number;
  duration: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** True when `next` is `prev` advanced by exactly one cell: same head step, length +0 or +1. */
function isOneStep(prev: readonly Vec[], next: readonly Vec[]): boolean {
  const a = prev[0];
  const b = next[0];
  if (!a || !b) return false;
  const stepLength = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return stepLength === 1 && (next.length === prev.length || next.length === prev.length + 1);
}

function bodiesEqual(a: readonly Vec[], b: readonly Vec[]): boolean {
  return (
    a.length === b.length &&
    a.every((cell, i) => {
      const other = b[i];
      return other !== undefined && other.x === cell.x && other.y === cell.y;
    })
  );
}

/**
 * Turns discrete grid moves into smooth motion. Each time a snake takes a step it slides from where
 * it was drawn to the new cells over one move interval, so speed looks constant. Anything that is not
 * a plain one-cell step (trim, respawn, resync) snaps instead of sliding through the board.
 */
export class SnakeTweener {
  private readonly tracks = new Map<number, Track>();

  push(snake: SnakeState, time: number): void {
    if (!snake.alive) {
      this.tracks.delete(snake.slot);
      return;
    }
    const track = this.tracks.get(snake.slot);
    if (!track) {
      this.tracks.set(snake.slot, { prev: snake.body, curr: snake.body, startedAt: time, duration: 1 });
      return;
    }
    if (bodiesEqual(track.curr, snake.body)) return;
    const from = this.sample(snake.slot, time) ?? track.curr;
    const slide = isOneStep(track.curr, snake.body);
    const ticks = snake.surge > 0 ? MOVE_EVERY_SURGE : MOVE_EVERY;
    this.tracks.set(snake.slot, {
      prev: slide ? from : snake.body,
      curr: snake.body,
      startedAt: time,
      duration: ticks * TICK_MS,
    });
  }

  sample(slot: number, time: number): Vec[] | null {
    const track = this.tracks.get(slot);
    if (!track) return null;
    const progress = (time - track.startedAt) / track.duration;
    // Rounding must not leave a finished slide a hair short of its target cell.
    const t = progress >= 1 - 1e-9 ? 1 : clamp01(progress);
    const last = track.prev.length - 1;
    return track.curr.map((cell, i) => lerp(track.prev[Math.min(i, last)] ?? cell, cell, t));
  }

  forget(slot: number): void {
    this.tracks.delete(slot);
  }
}

export function toDisplay(snake: SnakeState, points: Vec[]): DisplaySnake {
  return {
    slot: snake.slot,
    alive: snake.alive,
    dir: snake.dir,
    points,
    surge: snake.surge > 0,
    aegis: snake.aegis > 0,
    score: snake.score,
  };
}
