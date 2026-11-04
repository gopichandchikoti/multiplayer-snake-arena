import {
  END_GRACE_MS,
  TICK_MS,
  applyInput,
  createWorld,
  drainEvents,
  forfeitSnake,
  snapshotFromWorld,
  stepWorld,
  type Dir,
  type InputOutcome,
  type RoundResult,
  type ServerMsg,
  type WorldState,
} from '@snake/shared';
import type { Clock, Timer } from './clock';
import type { Logger } from './logger';
import type { Stats } from './stats';

export interface MatchOptions {
  clock: Clock;
  log: Logger;
  stats: Stats;
  slots: readonly number[];
  seed: number;
  roundTicks: number;
  /** Delivers a message to everyone in the room (the room serialises it once). */
  broadcast: (msg: ServerMsg) => void;
}

/** After this many consecutive late ticks the clock is re-anchored instead of fast-forwarding forever. */
const MAX_CATCH_UP = 5;

/**
 * One round of play: owns the world, runs it at a fixed tick rate against the server clock, and
 * turns each tick into a snapshot. Player input only ever reaches the world through `input`.
 */
export class Match {
  readonly world: WorldState;
  startedAt = 0;
  private readonly acks = new Map<number, number>();
  private timer: Timer | null = null;
  private finishTimer: Timer | null = null;
  private nextTickAt = 0;
  private over = false;

  constructor(
    private readonly options: MatchOptions,
    private readonly onFinished: (result: RoundResult) => void,
  ) {
    this.world = createWorld({ seed: options.seed, slots: options.slots, roundTicks: options.roundTicks });
  }

  get finished(): boolean {
    return this.over;
  }

  start(): void {
    const { clock } = this.options;
    this.startedAt = clock.now();
    this.nextTickAt = this.startedAt + TICK_MS;
    this.broadcastSnapshot(this.startedAt);
    this.scheduleNext();
  }

  /** Applies one validated turn for the player in `slot` and records that its sequence number was handled. */
  input(slot: number, seq: number, dir: Dir): InputOutcome {
    const outcome = applyInput(this.world, slot, dir);
    this.acks.set(slot, seq);
    return outcome;
  }

  forfeit(slot: number): void {
    if (this.over) return;
    forfeitSnake(this.world, slot);
    if (this.world.result) this.finish(this.tickTime(this.world.tick), true);
  }

  /** The current state as a message for one client (a reconnecting player), without consuming events. */
  snapshotMessage(): ServerMsg {
    return snapshotFromWorld(this.world, this.tickTime(this.world.tick), this.acks, []);
  }

  stop(): void {
    this.over = true;
    this.timer?.cancel();
    this.finishTimer?.cancel();
  }

  private tickTime(tick: number): number {
    return this.startedAt + tick * TICK_MS;
  }

  private scheduleNext(): void {
    const delay = Math.max(0, this.nextTickAt - this.options.clock.now());
    this.timer = this.options.clock.after(delay, () => {
      this.onTimer();
    });
  }

  private onTimer(): void {
    if (this.over) return;
    const now = this.options.clock.now();
    for (let ran = 0; this.nextTickAt <= now && ran < MAX_CATCH_UP && !this.finished; ran++) {
      this.options.stats.recordTickLag(now - this.nextTickAt);
      this.tickOnce();
      this.nextTickAt += TICK_MS;
    }
    if (this.nextTickAt <= now) this.reanchor(now);
    if (!this.finished) this.scheduleNext();
  }

  /** The process fell far behind (a long pause): continue from now rather than racing to catch up. */
  private reanchor(now: number): void {
    this.startedAt += now + TICK_MS - this.nextTickAt;
    this.nextTickAt = now + TICK_MS;
    this.options.log.warn('tick_clock_reanchored', { tick: this.world.tick });
  }

  private tickOnce(): void {
    stepWorld(this.world);
    const time = this.tickTime(this.world.tick);
    this.broadcastSnapshot(time);
    if (this.world.result) this.finish(time, false);
  }

  private broadcastSnapshot(time: number): void {
    const events = drainEvents(this.world);
    this.options.broadcast(snapshotFromWorld(this.world, time, this.acks, events));
  }

  /** `announce` sends one last snapshot, needed when the round ended outside a tick (a forfeit). */
  private finish(time: number, announce: boolean): void {
    if (this.over) return;
    this.over = true;
    this.timer?.cancel();
    if (announce) this.broadcastSnapshot(time);
    const result = this.world.result;
    if (!result) return;
    this.finishTimer = this.options.clock.after(END_GRACE_MS, () => {
      this.onFinished(result);
    });
  }
}
