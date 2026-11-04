import { PELLET_CAP, PELLET_EVERY_NTH_SEGMENT, SCORE } from '../constants';
import { encodePath } from '../codec';
import { cellKey } from '../geometry';
import type { DeathCause, RoundEndReason, SnakeState, Standing, Vec, WorldState } from '../types';
import { aliveSnakes, getSnake, requireHead } from './snake';
import { occupiedCells } from './world';

export interface Fatality {
  slot: number;
  cause: DeathCause;
  by: number | null;
}

/**
 * Removes the given snakes from the board together, so one snake dying never changes how another
 * is judged within the same tick. Elimination points go to a body owner only if it survives.
 */
export function killSnakes(world: WorldState, fatalities: readonly Fatality[]): void {
  const doomed = new Set(fatalities.map((f) => f.slot));
  const bodies: Vec[][] = [];
  for (const fatality of fatalities) {
    const snake = getSnake(world, fatality.slot);
    if (!snake?.alive) continue;
    creditKiller(world, fatality, doomed);
    bodies.push(removeSnake(world, snake, fatality));
  }
  for (const cells of bodies) dropPellets(world, cells);
}

function creditKiller(world: WorldState, fatality: Fatality, doomed: ReadonlySet<number>): void {
  if (fatality.by === null || doomed.has(fatality.by)) return;
  const killer = getSnake(world, fatality.by);
  if (!killer?.alive) return;
  killer.score += SCORE.elimination;
  killer.kills += 1;
}

function removeSnake(world: WorldState, snake: SnakeState, fatality: Fatality): Vec[] {
  const head = requireHead(snake);
  const cells = snake.body;
  world.events.push({
    type: 'die',
    slot: snake.slot,
    cause: fatality.cause,
    by: fatality.by,
    x: head.x,
    y: head.y,
    path: encodePath(cells),
  });
  snake.alive = false;
  snake.deathTick = world.tick;
  snake.finalLength = cells.length;
  snake.body = [];
  snake.queue = [];
  snake.surge = 0;
  snake.aegis = 0;
  return cells;
}

function dropPellets(world: WorldState, cells: readonly Vec[]): void {
  const taken = occupiedCells(world);
  let dropped = 0;
  for (let i = PELLET_EVERY_NTH_SEGMENT - 1; i < cells.length && dropped < PELLET_CAP; i += PELLET_EVERY_NTH_SEGMENT) {
    const cell = cells[i];
    if (!cell || taken.has(cellKey(cell.x, cell.y))) continue;
    world.foods.push({ id: world.nextId++, kind: 'pellet', x: cell.x, y: cell.y });
    taken.add(cellKey(cell.x, cell.y));
    dropped += 1;
  }
}

function compareSnakes(a: SnakeState, b: SnakeState): number {
  return b.score - a.score || length(b) - length(a) || b.kills - a.kills || a.slot - b.slot;
}

function length(snake: SnakeState): number {
  return snake.alive ? snake.body.length : snake.finalLength;
}

function buildStandings(world: WorldState): Standing[] {
  const ordered = [...world.snakes].sort(compareSnakes);
  const standings: Standing[] = [];
  ordered.forEach((snake, index) => {
    const previous = standings[index - 1];
    const tied =
      previous !== undefined &&
      previous.score === snake.score &&
      previous.length === length(snake) &&
      previous.kills === snake.kills;
    standings.push({
      slot: snake.slot,
      rank: tied ? previous.rank : index + 1,
      score: snake.score,
      kills: snake.kills,
      length: length(snake),
      alive: snake.alive,
    });
  });
  return standings;
}

/** Ends the round immediately and freezes the world; the last snake standing earns a bonus. */
export function endRound(world: WorldState, reason: RoundEndReason): void {
  if (world.result) return;
  const survivors = aliveSnakes(world);
  const [survivor] = survivors;
  if (reason === 'last-standing' && survivor && survivors.length === 1) {
    survivor.score += SCORE.lastStanding;
    world.events.push({ type: 'bonus', slot: survivor.slot, points: SCORE.lastStanding });
  }
  const standings = buildStandings(world);
  world.result = {
    reason,
    endedAtTick: world.tick,
    winnerSlots: standings.filter((s) => s.rank === 1).map((s) => s.slot),
    standings,
  };
}

/** Round-over rules, checked after every tick and after a forfeit. */
export function checkRoundEnd(world: WorldState): void {
  if (world.result) return;
  const alive = aliveSnakes(world).length;
  if (world.snakes.length >= 2 && alive <= 1) endRound(world, alive === 1 ? 'last-standing' : 'all-eliminated');
  else if (world.tick >= world.endsAtTick) endRound(world, 'timer');
}

export function forfeitSnake(world: WorldState, slot: number): void {
  killSnakes(world, [{ slot, cause: 'forfeit', by: null }]);
  checkRoundEnd(world);
}
