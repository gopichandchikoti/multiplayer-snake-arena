import {
  COUNTDOWN_SECONDS,
  END_GRACE_MS,
  TICK_MS,
  applyInput,
  botThink,
  createBot,
  createWorld,
  drainEvents,
  endRound,
  getSnake,
  stepWorld,
  type BotBrain,
  type BotLevel,
  type Dir,
  type GameEvent,
  type ThemeId,
  type WorldState,
} from '@snake/shared';
import type { ArenaFrame, GameSource, HudSnake, HudState, RosterEntry } from './source';
import { SnakeTweener, toDisplay } from './tween';

const BOT_NAMES = ['Pip', 'Marlo', 'Juniper', 'Tansy', 'Orrin', 'Wick', 'Briar'] as const;
/** After a long stall (background tab) we skip ahead instead of replaying every missed tick. */
const MAX_CATCH_UP_TICKS = 5;

export interface PracticeOptions {
  bots: number;
  level: BotLevel;
  theme: ThemeId;
  seed: number;
  playerName: string;
}

/**
 * Offline practice match against bots. It runs the same shared simulation as the server, in the
 * browser, and is never ranked or sent anywhere.
 */
export class PracticeGame implements GameSource {
  readonly offline = true;
  readonly roster: readonly RosterEntry[];
  private readonly world: WorldState;
  private readonly bots: BotBrain[];
  private readonly tweener = new SnakeTweener();
  private readonly eventListeners = new Set<(event: GameEvent) => void>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  private countdownEnd: number | null = null;
  private nextTickAt = 0;
  private lastNow = 0;
  private paused = false;
  private finishAt: number | null = null;
  private lastHud: HudState;

  constructor(private readonly options: PracticeOptions) {
    const botCount = Math.min(7, Math.max(1, options.bots));
    const slots = Array.from({ length: botCount + 1 }, (_, i) => i);
    this.world = createWorld({ seed: options.seed, slots });
    this.bots = slots.slice(1).map((slot) => createBot(slot, options.level, options.seed));
    this.roster = slots.map((slot) => ({
      slot,
      name: slot === 0 ? options.playerName : (BOT_NAMES[slot - 1] ?? `Bot ${slot}`),
      isLocal: slot === 0,
      isBot: slot !== 0,
    }));
    for (const snake of this.world.snakes) this.tweener.push(snake, 0);
    this.lastHud = this.buildHud('countdown', COUNTDOWN_SECONDS);
  }

  turn(dir: Dir): void {
    if (!this.paused && this.countdownEnd !== null) applyInput(this.world, 0, dir);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.emitHud({ ...this.lastHud, paused });
  }

  frame(nowMs: number): ArenaFrame {
    const dt = nowMs - this.lastNow;
    this.lastNow = nowMs;
    if (this.countdownEnd === null) this.begin(nowMs);
    else if (this.paused) this.shiftSchedule(dt);
    else this.advance(nowMs);
    return this.buildFrame(nowMs);
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

  private begin(nowMs: number): void {
    this.countdownEnd = nowMs + COUNTDOWN_SECONDS * 1000;
    this.nextTickAt = this.countdownEnd;
  }

  private shiftSchedule(dt: number): void {
    if (this.countdownEnd !== null) this.countdownEnd += dt;
    this.nextTickAt += dt;
    if (this.finishAt !== null) this.finishAt += dt;
  }

  private advance(nowMs: number): void {
    if (this.countdownEnd === null) return;
    if (nowMs < this.countdownEnd) {
      this.emitHud(this.buildHud('countdown', Math.ceil((this.countdownEnd - nowMs) / 1000)));
      return;
    }
    if (nowMs - this.nextTickAt > MAX_CATCH_UP_TICKS * TICK_MS) this.nextTickAt = nowMs;
    while (nowMs >= this.nextTickAt && this.lastHud.phase !== 'ended') {
      this.tick(this.nextTickAt);
      this.nextTickAt += TICK_MS;
    }
  }

  private tick(time: number): void {
    for (const bot of this.bots) {
      const turn = botThink(this.world, bot);
      if (turn !== null) applyInput(this.world, bot.slot, turn);
    }
    stepWorld(this.world);
    for (const snake of this.world.snakes) this.tweener.push(snake, time);
    for (const event of drainEvents(this.world)) for (const listener of this.eventListeners) listener(event);
    this.checkFinish(time);
    this.emitHud(this.buildHud(this.finished(time) ? 'ended' : 'playing', 0));
  }

  private checkFinish(time: number): void {
    if (this.finishAt !== null) return;
    const human = getSnake(this.world, 0);
    if (this.world.result || (human && !human.alive)) this.finishAt = time + END_GRACE_MS;
  }

  private finished(time: number): boolean {
    if (this.finishAt === null || time < this.finishAt) return false;
    if (!this.world.result) endRound(this.world, 'ended-early');
    return true;
  }

  private buildHud(phase: HudState['phase'], countdown: number): HudState {
    const remainingTicks = Math.max(0, this.world.endsAtTick - this.world.tick);
    const snakes: HudSnake[] = this.world.snakes.map((snake) => ({
      slot: snake.slot,
      name: this.roster.find((r) => r.slot === snake.slot)?.name ?? `Slot ${snake.slot}`,
      score: snake.score,
      kills: snake.kills,
      length: snake.alive ? snake.body.length : snake.finalLength,
      alive: snake.alive,
      surge: snake.surge > 0,
      aegis: snake.aegis > 0,
      isLocal: snake.slot === 0,
    }));
    return {
      phase,
      countdown,
      remainingMs: remainingTicks * TICK_MS,
      snakes,
      paused: this.paused,
      result: phase === 'ended' ? this.world.result : null,
      lag: null,
    };
  }

  private emitHud(hud: HudState): void {
    this.lastHud = hud;
    for (const listener of this.hudListeners) listener(hud);
  }

  private buildFrame(nowMs: number): ArenaFrame {
    const snakes = this.world.snakes.map((snake) => {
      const points = this.tweener.sample(snake.slot, nowMs) ?? [];
      return toDisplay(snake, points);
    });
    return {
      tick: this.world.tick,
      snakes,
      foods: this.world.foods,
      powerUps: this.world.powerUps,
      theme: this.options.theme,
      localSlot: 0,
    };
  }
}
