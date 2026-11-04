import { decodePath, encodePath } from './codec';
import type { SnakeWire, SnapshotMsg } from './protocol';
import type { FoodItem, GameEvent, PowerUpItem, SnakeState, WorldState } from './types';
import { requireHead } from './sim/snake';

/** What a client knows about the world: everything in a snapshot, decoded. */
export interface WorldView {
  tick: number;
  time: number;
  endsAtTick: number;
  snakes: SnakeState[];
  foods: FoodItem[];
  powerUps: PowerUpItem[];
  ack: ReadonlyMap<number, number>;
  events: GameEvent[];
}

export function snakeToWire(snake: SnakeState): SnakeWire {
  const head = snake.alive ? requireHead(snake) : { x: 0, y: 0 };
  return {
    s: snake.slot,
    a: snake.alive ? 1 : 0,
    d: snake.dir,
    q: [...snake.queue],
    h: [head.x, head.y],
    p: snake.alive ? encodePath(snake.body) : '',
    g: snake.grow,
    c: snake.countdown,
    sc: snake.score,
    k: snake.kills,
    sg: snake.surge,
    ag: snake.aegis,
  };
}

export function wireToSnake(wire: SnakeWire): SnakeState | null {
  const body = wire.a === 1 ? decodePath(wire.h, wire.p) : [];
  if (!body) return null;
  return {
    slot: wire.s,
    alive: wire.a === 1,
    dir: wire.d,
    queue: [...wire.q],
    body,
    grow: wire.g,
    countdown: wire.c,
    score: wire.sc,
    kills: wire.k,
    surge: wire.sg,
    aegis: wire.ag,
    deathTick: null,
    finalLength: body.length,
  };
}

export function snapshotFromWorld(
  world: WorldState,
  time: number,
  ack: ReadonlyMap<number, number>,
  events: readonly GameEvent[],
): SnapshotMsg {
  const ackRecord: Record<string, number> = {};
  for (const [slot, seq] of ack) ackRecord[String(slot)] = seq;
  return {
    type: 'snapshot',
    tick: world.tick,
    time,
    ends: world.endsAtTick,
    snakes: world.snakes.map(snakeToWire),
    foods: world.foods.map((f) => ({ ...f })),
    powerUps: world.powerUps.map((p) => ({ ...p })),
    ack: ackRecord,
    events: [...events],
  };
}

/** Decodes a validated snapshot; null when a snake path leaves the arena. */
export function viewFromSnapshot(msg: SnapshotMsg): WorldView | null {
  const snakes: SnakeState[] = [];
  for (const wire of msg.snakes) {
    const snake = wireToSnake(wire);
    if (!snake) return null;
    snakes.push(snake);
  }
  const ack = new Map<number, number>();
  for (const [slot, seq] of Object.entries(msg.ack)) ack.set(Number(slot), seq);
  return {
    tick: msg.tick,
    time: msg.time,
    endsAtTick: msg.ends,
    snakes,
    foods: msg.foods.map((f) => ({ ...f })),
    powerUps: msg.powerUps.map((p) => ({ ...p })),
    ack,
    events: [...msg.events],
  };
}
