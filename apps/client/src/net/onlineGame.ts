import {
  TICK_MS,
  predictSnake,
  viewFromSnapshot,
  type Dir,
  type GameEvent,
  type PendingInput,
  type RoomView,
  type RoundEndMsg,
  type SnapshotMsg,
  type ThemeId,
  type WorldView,
} from '@snake/shared';
import type { ArenaFrame, GameSource, HudSnake, HudState, RosterEntry } from '../game/source';
import { SnakeTweener, toDisplay, type DisplaySnake } from '../game/tween';
import type { ClockSync } from './clockSync';

/** Remote snakes are drawn this long after the server stepped them, which hides network jitter. */
export const RENDER_DELAY_MS = 2 * TICK_MS;
/** Never predict further ahead than this many ticks (a stalled connection must not run away). */
const MAX_AHEAD_TICKS = 12;
const MAX_PENDING = 64;

export interface OnlineGameDeps {
  /** Returns false when the message could not be sent (offline). */
  send: (msg: { type: 'input'; seq: number; dir: Dir }) => boolean;
  clock: ClockSync;
  room: () => RoomView | null;
  playerId: () => string | null;
  now?: () => number;
}

/**
 * A match as seen by one client. Everyone else's snakes are interpolated between authoritative
 * snapshots; the player's own snake is predicted by replaying the inputs the server has not yet
 * acknowledged, so steering responds at once. Each new snapshot silently corrects the prediction.
 */
export class OnlineGame implements GameSource {
  readonly offline = false;
  private latest: WorldView | null = null;
  private seq = 0;
  private pending: PendingInput[] = [];
  private remote = new SnakeTweener();
  private local = new SnakeTweener();
  private result: RoundEndMsg | null = null;
  private lastHud: HudState;
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  private readonly now: () => number;
  /** Snapshots dropped because their snake paths did not decode. Exposed for diagnostics and tests. */
  badSnapshots = 0;

  constructor(private readonly deps: OnlineGameDeps) {
    this.now = deps.now ?? ((): number => performance.now());
    this.lastHud = this.buildHud();
  }

  get roster(): readonly RosterEntry[] {
    const me = this.deps.playerId();
    const players = this.deps.room()?.players ?? [];
    return players.flatMap((p) =>
      p.slot === null
        ? []
        : [{ slot: p.slot, name: p.nick, isLocal: p.id === me && p.role === 'player', isBot: false }],
    );
  }

  private get localSlot(): number | null {
    return this.roster.find((r) => r.isLocal)?.slot ?? null;
  }

  turn(dir: Dir): void {
    const snap = this.latest;
    const slot = this.localSlot;
    if (!snap || slot === null || this.result) return;
    const me = snap.snakes.find((s) => s.slot === slot);
    if (!me?.alive) return;
    const seq = this.seq + 1;
    if (!this.deps.send({ type: 'input', seq, dir })) return;
    this.seq = seq;
    const applyTick = this.horizon(snap, this.now()) + 1;
    this.pending.push({ seq, dir, applyTick });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  frame(nowMs: number): ArenaFrame {
    const snap = this.latest;
    const theme: ThemeId = this.deps.room()?.theme ?? 'parchment';
    if (!snap) return { tick: 0, snakes: [], foods: [], powerUps: [], theme, localSlot: this.localSlot };
    const slot = this.localSlot;
    const horizon = this.horizon(snap, nowMs);
    const snakes: DisplaySnake[] = snap.snakes.map((snake) => {
      if (snake.slot !== slot) return toDisplay(snake, this.remote.sample(snake.slot, nowMs) ?? []);
      const predicted = predictSnake(snake, {
        foods: snap.foods,
        pending: this.pending,
        fromTick: snap.tick,
        toTick: horizon,
      });
      this.local.push(predicted, nowMs);
      return toDisplay(predicted, this.local.sample(slot, nowMs) ?? []);
    });
    return {
      tick: Math.floor(this.estimateTick(snap, nowMs)),
      snakes,
      foods: snap.foods,
      powerUps: snap.powerUps,
      theme,
      localSlot: slot,
    };
  }

  hud(): HudState {
    return this.lastHud;
  }

  subscribeEvents(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeHud(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  dispose(): void {
    this.eventListeners.clear();
    this.hudListeners.clear();
  }

  onSnapshot(msg: SnapshotMsg): void {
    const view = viewFromSnapshot(msg);
    if (!view) {
      this.badSnapshots += 1;
      return;
    }
    if (this.latest && view.tick < this.latest.tick) return;
    this.latest = view;
    this.reconcile(view);
    for (const event of view.events) for (const listener of this.eventListeners) listener(event);
    this.emitHud();
  }

  /** Forgets inputs the server has handled and queues the other snakes' new positions for smooth display. */
  private reconcile(view: WorldView): void {
    const slot = this.localSlot;
    const acked = slot === null ? 0 : (view.ack.get(slot) ?? 0);
    this.pending = this.pending.filter((p) => p.seq > acked);
    const { clock } = this.deps;
    const shownAt = (clock.ready ? clock.clientTime(view.time) : this.now()) + RENDER_DELAY_MS;
    for (const snake of view.snakes) {
      if (snake.slot !== slot) this.remote.push(snake, shownAt);
      else if (!snake.alive) this.local.forget(snake.slot);
    }
  }

  onRoundEnd(msg: RoundEndMsg): void {
    this.result = msg;
    this.emitHud();
  }

  /** The socket came back: whatever was in flight is lost, so forget it and snap to the server's picture. */
  onReconnected(): void {
    this.pending = [];
    this.remote = new SnakeTweener();
    this.local = new SnakeTweener();
  }

  private estimateTick(snap: WorldView, nowMs: number): number {
    const { clock } = this.deps;
    return clock.ready ? snap.tick + (clock.serverNow(nowMs) - snap.time) / TICK_MS : snap.tick;
  }

  /** The tick the server will be at when something sent now arrives: the point the player's snake is shown at. */
  private horizon(snap: WorldView, nowMs: number): number {
    const oneWay = this.deps.clock.ready ? this.deps.clock.rtt / 2 / TICK_MS : 0;
    const wanted = Math.floor(this.estimateTick(snap, nowMs) + oneWay);
    return Math.min(snap.tick + MAX_AHEAD_TICKS, Math.max(snap.tick, wanted));
  }

  private buildHud(): HudState {
    const snap = this.latest;
    const roster = this.roster;
    const snakes: HudSnake[] = (snap?.snakes ?? []).map((snake) => ({
      slot: snake.slot,
      name: roster.find((r) => r.slot === snake.slot)?.name ?? `Player ${snake.slot + 1}`,
      score: snake.score,
      kills: snake.kills,
      length: snake.body.length,
      alive: snake.alive,
      surge: snake.surge > 0,
      aegis: snake.aegis > 0,
      isLocal: roster.find((r) => r.slot === snake.slot)?.isLocal ?? false,
    }));
    const remainingTicks = snap ? Math.max(0, snap.endsAtTick - this.estimateTick(snap, this.now())) : 0;
    return {
      phase: this.result ? 'ended' : 'playing',
      countdown: 0,
      remainingMs: remainingTicks * TICK_MS,
      snakes,
      paused: false,
      result: this.result
        ? {
            reason: this.result.reason,
            endedAtTick: this.result.endedAtTick,
            winnerSlots: this.result.winnerSlots,
            standings: this.result.standings,
          }
        : null,
      lag: this.deps.clock.info(),
    };
  }

  private emitHud(): void {
    this.lastHud = this.buildHud();
    for (const listener of this.hudListeners) listener(this.lastHud);
  }
}
