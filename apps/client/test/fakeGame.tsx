import type { Dir, GameEvent, RoundResult } from '@snake/shared';
import type { ArenaFrame, GameSource, HudState, RosterEntry } from '../src/game/source';

export const roster: RosterEntry[] = [
  { slot: 0, name: 'Ada', isLocal: true, isBot: false },
  { slot: 1, name: 'Pip', isLocal: false, isBot: true },
];

export const result: RoundResult = {
  reason: 'last-standing',
  endedAtTick: 100,
  winnerSlots: [1],
  standings: [
    { slot: 1, rank: 1, score: 100, kills: 1, length: 6, alive: true },
    { slot: 0, rank: 2, score: 20, kills: 0, length: 4, alive: false },
  ],
};

export class FakeGame implements GameSource {
  static last: FakeGame | null = null;
  readonly offline = true;
  readonly roster = roster;
  turns: Dir[] = [];
  paused: boolean[] = [];
  disposed = false;
  private current: HudState = {
    phase: 'playing',
    countdown: 0,
    remainingMs: 90_000,
    paused: false,
    result: null,
    snakes: roster.map((r) => ({
      slot: r.slot,
      name: r.name,
      score: r.slot * 10,
      kills: 0,
      length: 4,
      alive: true,
      surge: false,
      aegis: false,
      isLocal: r.isLocal,
    })),
  };
  private readonly huds = new Set<(h: HudState) => void>();
  private readonly events = new Set<(e: GameEvent) => void>();
  constructor() {
    FakeGame.last = this;
  }
  frame(): ArenaFrame {
    return { tick: 0, snakes: [], foods: [], powerUps: [], theme: 'parchment', localSlot: 0 };
  }
  turn(dir: Dir): void {
    this.turns.push(dir);
  }
  hud(): HudState {
    return this.current;
  }
  subscribeEvents(listener: (e: GameEvent) => void): () => void {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }
  subscribeHud(listener: (h: HudState) => void): () => void {
    this.huds.add(listener);
    return () => this.huds.delete(listener);
  }
  setPaused(paused: boolean): void {
    this.paused.push(paused);
    this.push({ ...this.current, paused });
  }
  dispose(): void {
    this.disposed = true;
  }
  push(next: HudState): void {
    this.current = next;
    for (const l of this.huds) l(next);
  }
  emit(event: GameEvent): void {
    for (const l of this.events) l(event);
  }
}
