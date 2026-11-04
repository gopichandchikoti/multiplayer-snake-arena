/** Heading: 0 = up, 1 = right, 2 = down, 3 = left. */
export type Dir = 0 | 1 | 2 | 3;

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export type FoodKind = 'apple' | 'golden' | 'pellet';
export type PowerUpKind = 'surge' | 'aegis' | 'trim';
export type DeathCause = 'wall' | 'body' | 'head-on' | 'forfeit';
export type RoundEndReason = 'timer' | 'last-standing' | 'all-eliminated' | 'ended-early';
export type ThemeId = 'parchment' | 'kiln' | 'tidepool';

export interface FoodItem {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
}

export interface PowerUpItem {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  expiresAt: number;
}

export interface SnakeState {
  slot: number;
  alive: boolean;
  dir: Dir;
  /** Turns waiting for the next move, oldest first. */
  queue: Dir[];
  /** Cells, head first. Empty once the snake is dead. */
  body: Vec[];
  /** Segments still to be added at the tail. */
  grow: number;
  /** Ticks until the next move; the snake moves on the tick this reaches 0. */
  countdown: number;
  score: number;
  kills: number;
  surge: number;
  aegis: number;
  deathTick: number | null;
  finalLength: number;
}

export type GameEvent =
  | { type: 'eat'; slot: number; kind: FoodKind; x: number; y: number; points: number }
  | { type: 'power'; slot: number; kind: PowerUpKind; x: number; y: number }
  | { type: 'shield-break'; slot: number; x: number; y: number }
  | { type: 'die'; slot: number; cause: DeathCause; by: number | null; x: number; y: number; path: string }
  | { type: 'bonus'; slot: number; points: number }
  | { type: 'spawn-power'; kind: PowerUpKind; x: number; y: number };

export interface Standing {
  slot: number;
  rank: number;
  score: number;
  kills: number;
  length: number;
  alive: boolean;
}

export interface RoundResult {
  reason: RoundEndReason;
  endedAtTick: number;
  winnerSlots: number[];
  standings: Standing[];
}

export interface WorldState {
  tick: number;
  rng: number;
  nextId: number;
  snakes: SnakeState[];
  foods: FoodItem[];
  powerUps: PowerUpItem[];
  endsAtTick: number;
  nextPowerUpTick: number;
  events: GameEvent[];
  result: RoundResult | null;
}
