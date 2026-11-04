import { cellKey, inBounds } from '../geometry';
import type { DeathCause, Dir, SnakeState, Vec, WorldState } from '../types';
import { movedBody } from './snake';

export interface MovePlan {
  snake: SnakeState;
  dir: Dir;
  head: Vec;
  grows: boolean;
}

export interface Collision {
  cause: Exclude<DeathCause, 'forfeit'>;
  /** Snake whose body was hit; it earns the elimination if it survives the tick. */
  by: number | null;
}

interface Owner {
  slot: number;
  index: number;
  moving: boolean;
}

/**
 * Every cell each living snake will occupy once all planned moves are applied at the same moment.
 * Judging against this single picture is what makes the outcome independent of snake order.
 */
function buildOccupancy(world: WorldState, moving: readonly MovePlan[]): Map<number, Owner[]> {
  const plans = new Map(moving.map((p) => [p.snake.slot, p]));
  const occupancy = new Map<number, Owner[]>();
  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    const plan = plans.get(snake.slot);
    const cells = plan ? movedBody(snake, plan.head, plan.grows) : snake.body;
    cells.forEach((cell, index) => {
      if (!inBounds(cell.x, cell.y)) return;
      const key = cellKey(cell.x, cell.y);
      const owner: Owner = { slot: snake.slot, index, moving: plan !== undefined };
      const list = occupancy.get(key);
      if (list) list.push(owner);
      else occupancy.set(key, [owner]);
    });
  }
  return occupancy;
}

function classifyHit(plan: MovePlan, owners: readonly Owner[]): Collision | null {
  const others = owners.filter((o) => !(o.slot === plan.snake.slot && o.index === 0));
  if (others.some((o) => o.index === 0 && o.moving)) return { cause: 'head-on', by: null };
  const hit = others[0];
  if (!hit) return null;
  return { cause: 'body', by: hit.slot === plan.snake.slot ? null : hit.slot };
}

function collisionFor(plan: MovePlan, occupancy: Map<number, Owner[]>): Collision | null {
  if (!inBounds(plan.head.x, plan.head.y)) return { cause: 'wall', by: null };
  return classifyHit(plan, occupancy.get(cellKey(plan.head.x, plan.head.y)) ?? []);
}

export function findCollisions(world: WorldState, moving: readonly MovePlan[]): Map<number, Collision> {
  const occupancy = buildOccupancy(world, moving);
  const deaths = new Map<number, Collision>();
  for (const plan of moving) {
    const collision = collisionFor(plan, occupancy);
    if (collision) deaths.set(plan.snake.slot, collision);
  }
  return deaths;
}

export interface Resolution {
  moving: MovePlan[];
  /** Moves a shield turned into a stumble. */
  cancelled: MovePlan[];
  deaths: Map<number, Collision>;
}

/**
 * Finds who crashes. A snake holding an aegis does not die: its move is cancelled and the shield is
 * spent. That changes the picture for everyone else, so the check repeats until nothing changes.
 */
export function resolveMoves(world: WorldState, plans: readonly MovePlan[]): Resolution {
  let moving = [...plans];
  const cancelled: MovePlan[] = [];
  for (;;) {
    const deaths = findCollisions(world, moving);
    const shielded = moving.filter((p) => deaths.has(p.snake.slot) && p.snake.aegis > 0);
    if (shielded.length === 0) return { moving, cancelled, deaths };
    for (const plan of shielded) plan.snake.aegis = 0;
    cancelled.push(...shielded);
    moving = moving.filter((p) => !shielded.includes(p));
  }
}
