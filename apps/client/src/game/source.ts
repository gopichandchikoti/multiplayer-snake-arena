import type { Dir, FoodItem, GameEvent, PowerUpItem, RoundResult, ThemeId } from '@snake/shared';
import type { LagInfo } from '../net/clockSync';
import type { DisplaySnake } from './tween';

export interface RosterEntry {
  slot: number;
  name: string;
  isLocal: boolean;
  isBot: boolean;
}

export interface ArenaFrame {
  tick: number;
  snakes: DisplaySnake[];
  foods: readonly FoodItem[];
  powerUps: readonly PowerUpItem[];
  theme: ThemeId;
  /** Slot of the player watching, or null for spectators. */
  localSlot: number | null;
}

export interface HudSnake {
  slot: number;
  name: string;
  score: number;
  kills: number;
  length: number;
  alive: boolean;
  surge: boolean;
  aegis: boolean;
  isLocal: boolean;
}

export type HudPhase = 'countdown' | 'playing' | 'ended';

export interface HudState {
  phase: HudPhase;
  /** Whole seconds shown on the 3-2-1 overlay while `phase` is countdown. */
  countdown: number;
  remainingMs: number;
  snakes: HudSnake[];
  paused: boolean;
  result: RoundResult | null;
  /** Network quality; null when there is no network (offline practice) or no measurement yet. */
  lag: LagInfo | null;
}

/**
 * What the arena needs from whatever is running the match: the offline practice runner and the
 * network client both implement it, so one renderer and one HUD serve both.
 */
export interface GameSource {
  readonly roster: readonly RosterEntry[];
  readonly offline: boolean;
  frame(nowMs: number): ArenaFrame;
  turn(dir: Dir): void;
  hud(): HudState;
  subscribeEvents(listener: (event: GameEvent) => void): () => void;
  subscribeHud(listener: (hud: HudState) => void): () => void;
  setPaused?(paused: boolean): void;
  dispose(): void;
}
