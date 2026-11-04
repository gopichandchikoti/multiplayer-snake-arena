import type Phaser from 'phaser';
import type { Vec } from '@snake/shared';
import { type Layout, angleForDir, cellToPixel, worldDirToScreen } from '../game/layout';
import { POWERUP_STYLES, THEMES, hexToInt } from '../game/palette';
import type { ArenaFrame, RosterEntry } from '../game/source';
import type { DisplaySnake } from '../game/tween';

interface Sprites {
  outlines: Phaser.GameObjects.Image[];
  fills: Phaser.GameObjects.Image[];
  headOutline: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Everything one snake needs to be drawn this frame, gathered once so helpers take few arguments. */
interface Pose {
  snake: DisplaySnake;
  pixels: readonly Vec[];
  layout: Layout;
  outline: number;
  backdrop: string;
  name: string;
  isLocal: boolean;
  time: number;
  calm: boolean;
}

export interface DrawView {
  roster: readonly RosterEntry[];
  time: number;
  calm: boolean;
}

const TAPER_SEGMENTS = 4;

/** Draws every snake as pooled sprites: a silhouette layer, a patterned fill layer, a head and a name tag. */
export class SnakeRenderer {
  private readonly pools = new Map<number, Sprites>();
  private readonly auras: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.auras = scene.add.graphics().setDepth(13);
  }

  draw(frame: ArenaFrame, layout: Layout, view: DrawView): void {
    this.auras.clear();
    const theme = THEMES[frame.theme];
    for (const snake of frame.snakes) {
      const sprites = this.pool(snake.slot);
      if (!snake.alive || snake.points.length === 0) {
        this.hide(sprites);
        continue;
      }
      const pose: Pose = {
        snake,
        pixels: snake.points.map((p) => cellToPixel(layout, p)),
        layout,
        outline: hexToInt(theme.outline),
        backdrop: theme.backdrop,
        name: view.roster.find((r) => r.slot === snake.slot)?.name ?? '',
        isLocal: frame.localSlot === snake.slot,
        time: view.time,
        calm: view.calm,
      };
      this.drawBody(sprites, pose);
      this.drawHead(sprites, pose);
      this.drawLabel(sprites, pose);
      this.drawAuras(pose);
    }
  }

  destroy(): void {
    for (const sprites of this.pools.values()) this.hide(sprites);
    this.auras.destroy();
  }

  private pool(slot: number): Sprites {
    const existing = this.pools.get(slot);
    if (existing) return existing;
    const created: Sprites = {
      outlines: [],
      fills: [],
      headOutline: this.scene.add.image(0, 0, 'outline-body').setDepth(10),
      head: this.scene.add.image(0, 0, `head-${slot % 8}`).setDepth(12),
      label: this.scene.add
        .text(0, 0, '', { fontFamily: 'Instrument Sans Variable, sans-serif', fontStyle: '700' })
        .setDepth(14),
    };
    created.label.setOrigin(0.5, 1);
    this.pools.set(slot, created);
    return created;
  }

  private hide(sprites: Sprites): void {
    const all = [...sprites.outlines, ...sprites.fills, sprites.headOutline, sprites.head, sprites.label];
    for (const sprite of all) sprite.setVisible(false);
  }

  private drawBody(sprites: Sprites, pose: Pose): void {
    const { snake, pixels, layout, outline } = pose;
    const count = pixels.length - 1;
    while (sprites.fills.length < count) {
      sprites.outlines.push(this.scene.add.image(0, 0, 'outline-body').setDepth(10));
      sprites.fills.push(this.scene.add.image(0, 0, `seg-${snake.slot % 8}`).setDepth(11));
    }
    sprites.fills.forEach((fill, i) => {
      const outlineImage = sprites.outlines[i];
      const here = pixels[i + 1];
      if (!outlineImage || !here) {
        fill.setVisible(false);
        outlineImage?.setVisible(false);
        return;
      }
      const before = pixels[i] ?? here;
      const after = pixels[i + 2] ?? here;
      const angle = Math.atan2(before.y - after.y, before.x - after.x);
      const size = layout.cell * 1.04 * this.taper(i + 1, pixels.length);
      fill.setVisible(true).setPosition(here.x, here.y).setRotation(angle).setDisplaySize(size, size);
      outlineImage
        .setVisible(true)
        .setPosition(here.x, here.y)
        .setTint(outline)
        .setDisplaySize(size + layout.cell * 0.22, size + layout.cell * 0.22);
    });
  }

  private taper(index: number, length: number): number {
    const fromTail = length - 1 - index;
    return fromTail >= TAPER_SEGMENTS ? 1 : 0.68 + 0.32 * (fromTail / TAPER_SEGMENTS);
  }

  private drawHead(sprites: Sprites, pose: Pose): void {
    const { pixels, layout, snake, outline } = pose;
    const head = pixels[0];
    if (!head) return;
    const neck = pixels[1] ?? head;
    const moving = Math.hypot(head.x - neck.x, head.y - neck.y) > 0.5;
    const angle = moving
      ? Math.atan2(head.y - neck.y, head.x - neck.x)
      : angleForDir(worldDirToScreen(layout, snake.dir));
    const size = layout.cell * 1.16;
    sprites.head.setVisible(true).setPosition(head.x, head.y).setRotation(angle).setDisplaySize(size, size);
    sprites.headOutline
      .setVisible(true)
      .setPosition(head.x, head.y)
      .setRotation(angle)
      .setTint(outline)
      .setDisplaySize(size + layout.cell * 0.22, size + layout.cell * 0.22);
  }

  private drawLabel(sprites: Sprites, pose: Pose): void {
    const head = pose.pixels[0];
    if (!head) return;
    const px = Math.max(10, Math.round(pose.layout.cell * 0.62));
    sprites.label
      .setVisible(true)
      .setText(pose.isLocal ? `${pose.name} (you)` : pose.name)
      .setFontSize(px)
      .setColor(pose.isLocal ? '#ffffff' : '#f1ece0')
      .setStroke(pose.backdrop, Math.max(3, px * 0.3))
      .setPosition(head.x, head.y - pose.layout.cell * 0.85);
  }

  private drawAuras(pose: Pose): void {
    const head = pose.pixels[0];
    if (!head) return;
    const { layout } = pose;
    if (pose.snake.aegis) {
      const pulse = pose.calm ? 0.7 : 0.55 + 0.25 * Math.sin(pose.time / 160);
      const color = hexToInt(POWERUP_STYLES.aegis.color);
      this.auras.lineStyle(Math.max(2, layout.cell * 0.14), color, pulse);
      this.auras.strokeCircle(head.x, head.y, layout.cell * 0.95);
      this.auras.fillStyle(color, 0.12).fillCircle(head.x, head.y, layout.cell * 0.95);
    }
    if (pose.snake.surge) this.drawSpeedLines(pose, head);
  }

  private drawSpeedLines(pose: Pose, head: Vec): void {
    const neck = pose.pixels[1] ?? head;
    const dx = neck.x - head.x;
    const dy = neck.y - head.y;
    const len = Math.hypot(dx, dy) || 1;
    const color = hexToInt(POWERUP_STYLES.surge.color);
    const cell = pose.layout.cell;
    for (let i = 1; i <= 3; i++) {
      const reach = cell * (0.6 + i * 0.55);
      this.auras.lineStyle(Math.max(2, cell * 0.12), color, 0.7 - i * 0.18);
      this.auras.lineBetween(
        head.x + (dx / len) * cell * 0.5,
        head.y + (dy / len) * cell * 0.5,
        head.x + (dx / len) * reach,
        head.y + (dy / len) * reach,
      );
    }
  }
}
