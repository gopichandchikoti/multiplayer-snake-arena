import type Phaser from 'phaser';
import { GRID_H, GRID_W, POWERUP_LIFETIME_TICKS } from '@snake/shared';
import type { ArenaFrame } from '../game/source';
import { type Layout, cellToPixel } from '../game/layout';
import { POWERUP_STYLES, THEMES, hexToInt } from '../game/palette';

const FOOD_SIZE = { apple: 0.86, golden: 1.05, pellet: 0.5 } as const;

/** Draws the board and everything lying on it: tiles, grid, food and power-ups. */
export class BoardRenderer {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly foods = new Map<number, Phaser.GameObjects.Image>();
  private readonly powerUps = new Map<number, Phaser.GameObjects.Image>();
  private groundKey = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(0);
    this.rings = scene.add.graphics().setDepth(7);
  }

  invalidate(): void {
    this.groundKey = '';
  }

  draw(frame: ArenaFrame, layout: Layout, time: number, calm: boolean): void {
    this.drawGround(frame, layout);
    this.drawFoods(frame, layout, time, calm);
    this.drawPowerUps(frame, layout, time, calm);
  }

  private drawGround(frame: ArenaFrame, layout: Layout): void {
    const { width, height } = this.scene.scale;
    const key = `${width}x${height}:${layout.cell}:${layout.rotated ? 1 : 0}:${frame.theme}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const theme = THEMES[frame.theme];
    const g = this.ground;
    const { cell, originX, originY, cols, rows } = layout;
    g.clear();
    g.fillStyle(hexToInt(theme.backdrop), 1).fillRect(0, 0, width, height);
    const pad = cell * 0.4;
    g.fillStyle(hexToInt(theme.frame), 1);
    g.fillRoundedRect(originX - pad, originY - pad, cols * cell + pad * 2, rows * cell + pad * 2, cell * 0.6);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const centre = cellToPixel(layout, { x, y });
        g.fillStyle(hexToInt((x + y) % 2 === 0 ? theme.board : theme.boardAlt), 1);
        g.fillRect(centre.x - cell / 2, centre.y - cell / 2, cell, cell);
      }
    }
    g.lineStyle(Math.max(1, cell * 0.04), hexToInt(theme.grid), 0.55);
    for (let i = 0; i <= cols; i++)
      g.lineBetween(originX + i * cell, originY, originX + i * cell, originY + rows * cell);
    for (let j = 0; j <= rows; j++)
      g.lineBetween(originX, originY + j * cell, originX + cols * cell, originY + j * cell);
  }

  private drawFoods(frame: ArenaFrame, layout: Layout, time: number, calm: boolean): void {
    const live = new Set<number>();
    for (const food of frame.foods) {
      live.add(food.id);
      let image = this.foods.get(food.id);
      if (!image) {
        image = this.scene.add.image(0, 0, `food-${food.kind}`).setDepth(5);
        this.foods.set(food.id, image);
      }
      const at = cellToPixel(layout, food);
      const bob = calm ? 1 : 1 + 0.06 * Math.sin(time / 280 + food.id);
      const size = layout.cell * FOOD_SIZE[food.kind] * bob;
      image.setPosition(at.x, at.y).setDisplaySize(size, size);
    }
    this.prune(this.foods, live);
  }

  private drawPowerUps(frame: ArenaFrame, layout: Layout, time: number, calm: boolean): void {
    const live = new Set<number>();
    this.rings.clear();
    for (const power of frame.powerUps) {
      live.add(power.id);
      let image = this.powerUps.get(power.id);
      if (!image) {
        image = this.scene.add.image(0, 0, `power-${power.kind}`).setDepth(6);
        this.powerUps.set(power.id, image);
      }
      const at = cellToPixel(layout, power);
      const size = layout.cell * (calm ? 1.15 : 1.15 + 0.08 * Math.sin(time / 200));
      image.setPosition(at.x, at.y).setDisplaySize(size, size);
      const left = Math.max(0, Math.min(1, (power.expiresAt - frame.tick) / POWERUP_LIFETIME_TICKS));
      const urgent = left < 0.25 && !calm && Math.floor(time / 250) % 2 === 0;
      this.rings.lineStyle(
        Math.max(2, layout.cell * 0.12),
        hexToInt(POWERUP_STYLES[power.kind].color),
        urgent ? 0.35 : 1,
      );
      this.rings.beginPath();
      this.rings.arc(at.x, at.y, layout.cell * 0.85, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      this.rings.strokePath();
    }
    this.prune(this.powerUps, live);
  }

  private prune(map: Map<number, Phaser.GameObjects.Image>, live: ReadonlySet<number>): void {
    for (const [id, image] of map) {
      if (live.has(id)) continue;
      image.destroy();
      map.delete(id);
    }
  }
}
