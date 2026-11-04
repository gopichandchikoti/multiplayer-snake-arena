import Phaser from 'phaser';
import { decodePath, type FoodKind, type GameEvent } from '@snake/shared';
import { type Layout, cellToPixel, computeLayout } from '../game/layout';
import { hexToInt, snakeStyle } from '../game/palette';
import type { GameSource } from '../game/source';
import type { Settings } from '../state/settings';
import { generateTextures } from './art';
import { BoardRenderer } from './boardRenderer';
import { Effects } from './effects';
import type { Sfx } from './sfx';
import { SnakeRenderer } from './snakeRenderer';

export interface SceneDeps {
  source: GameSource;
  getSettings: () => Settings;
  reducedMotion: () => boolean;
  sfx: Sfx;
  /** Called whenever the arena is laid out, so touch controls can follow a rotated board. */
  onLayout: (layout: Layout) => void;
}

const FOOD_COLORS: Readonly<Record<FoodKind, number>> = { apple: 0xd7322b, golden: 0xffd24a, pellet: 0xf3e6d3 };
type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export class ArenaScene extends Phaser.Scene {
  private layout: Layout = computeLayout(960, 672);
  private board!: BoardRenderer;
  private snakes!: SnakeRenderer;
  private effects!: Effects;
  private unsubscribe: (() => void) | null = null;
  private patterned = true;
  private closed = false;

  constructor(private readonly deps: SceneDeps) {
    super('arena');
  }

  create(): void {
    this.patterned = this.deps.getSettings().patterns;
    generateTextures(this, this.patterned);
    this.board = new BoardRenderer(this);
    this.snakes = new SnakeRenderer(this);
    this.effects = new Effects(this, this.deps.reducedMotion);
    this.relayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    this.unsubscribe = this.deps.source.subscribeEvents((event) => {
      this.onEvent(event);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup);
  }

  override update(time: number): void {
    if (this.closed) return;
    const settings = this.deps.getSettings();
    if (settings.patterns !== this.patterned) this.rebuildArt(settings.patterns);
    const frame = this.deps.source.frame(time);
    const calm = this.deps.reducedMotion();
    this.board.draw(frame, this.layout, time, calm);
    this.snakes.draw(frame, this.layout, { roster: this.deps.source.roster, time, calm });
  }

  private readonly relayout = (): void => {
    const margin = Math.round(Math.min(this.scale.width, this.scale.height) * 0.025);
    this.layout = computeLayout(this.scale.width, this.scale.height, margin);
    this.board.invalidate();
    this.deps.onLayout(this.layout);
  };

  private rebuildArt(patterned: boolean): void {
    this.patterned = patterned;
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('seg-') || key.startsWith('head-')) this.textures.remove(key);
    }
    generateTextures(this, patterned);
  }

  private pixel(x: number, y: number): { x: number; y: number } {
    return cellToPixel(this.layout, { x, y });
  }

  private isMine(event: GameEvent): boolean {
    const local = this.deps.source.roster.find((r) => r.isLocal)?.slot;
    return 'slot' in event && event.slot === local;
  }

  private onEvent(event: GameEvent): void {
    const mine = this.isMine(event);
    switch (event.type) {
      case 'eat':
        this.onEat(event, mine);
        break;
      case 'power':
        this.effects.ring(this.pixel(event.x, event.y), 0xffffff, this.layout.cell * 1.4);
        if (mine) this.deps.sfx.play('power');
        break;
      case 'spawn-power':
        this.effects.ring(this.pixel(event.x, event.y), 0xffffff, this.layout.cell);
        break;
      case 'shield-break':
        this.effects.ring(this.pixel(event.x, event.y), hexToInt('#4DA3E0'), this.layout.cell * 1.6);
        this.deps.sfx.play('shield', mine ? 1 : 0.4);
        break;
      case 'die':
        this.onDeath(event, mine);
        break;
      case 'bonus':
        if (mine) this.deps.sfx.play('win');
        break;
    }
  }

  private onEat(event: EventOf<'eat'>, mine: boolean): void {
    const at = this.pixel(event.x, event.y);
    this.effects.burst(at, FOOD_COLORS[event.kind], this.layout.cell);
    if (!mine) return;
    this.effects.floatText(at, `+${event.points}`, '#ffffff', this.layout.cell);
    this.deps.sfx.play(event.kind === 'golden' ? 'golden' : 'eat');
  }

  private onDeath(event: EventOf<'die'>, mine: boolean): void {
    const cells = decodePath([event.x, event.y], event.path) ?? [];
    const color = hexToInt(snakeStyle(event.slot).fill);
    this.effects.scatter(
      cells.map((c) => this.pixel(c.x, c.y)),
      color,
      this.layout.cell,
    );
    this.deps.sfx.play('die', mine ? 1 : 0.35);
    if (mine) this.effects.shake();
  }

  private readonly cleanup = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
    this.snakes.destroy();
  };
}
