import Phaser from 'phaser';
import { SNAKE_STYLES, hexToInt, type PatternId, type SnakeStyle } from '../game/palette';

/** Texture size in pixels; sprites are scaled to the cell size at draw time. */
export const ART = 64;

type G = Phaser.GameObjects.Graphics;

function pattern(g: G, id: PatternId, mark: number): void {
  g.fillStyle(mark, 1);
  g.lineStyle(6, mark, 1);
  switch (id) {
    case 'stripes':
      g.lineBetween(14, 50, 50, 14);
      g.lineBetween(14, 32, 32, 14);
      g.lineBetween(32, 50, 50, 32);
      break;
    case 'dots':
      g.fillCircle(20, 22, 7);
      g.fillCircle(44, 22, 7);
      g.fillCircle(32, 44, 7);
      break;
    case 'chevrons':
      g.lineBetween(18, 14, 42, 32);
      g.lineBetween(42, 32, 18, 50);
      break;
    case 'checks':
      g.fillRect(12, 12, 20, 20);
      g.fillRect(32, 32, 20, 20);
      break;
    case 'rings':
      g.lineStyle(6, mark, 1);
      g.strokeCircle(32, 32, 15);
      break;
    case 'diamonds':
      g.fillPoints(
        [
          new Phaser.Geom.Point(32, 12),
          new Phaser.Geom.Point(52, 32),
          new Phaser.Geom.Point(32, 52),
          new Phaser.Geom.Point(12, 32),
        ],
        true,
      );
      break;
    case 'hatch':
      g.lineStyle(4, mark, 1);
      g.lineBetween(14, 14, 50, 50);
      g.lineBetween(50, 14, 14, 50);
      break;
    case 'solid':
      break;
  }
}

function makeSegment(scene: Phaser.Scene, style: SnakeStyle, patterned: boolean): void {
  const g = scene.make.graphics({}, false);
  g.fillStyle(hexToInt(style.fill), 1);
  g.fillRoundedRect(2, 2, ART - 4, ART - 4, 14);
  if (patterned) pattern(g, style.pattern, hexToInt(style.mark));
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(10, 8, ART - 20, 12, 6);
  g.generateTexture(`seg-${style.slot}`, ART, ART);
  g.destroy();
}

function makeHead(scene: Phaser.Scene, style: SnakeStyle): void {
  const g = scene.make.graphics({}, false);
  g.fillStyle(hexToInt(style.fill), 1);
  g.fillRoundedRect(2, 4, ART - 4, ART - 8, 24);
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(8, 8, ART - 20, 12, 6);
  for (const y of [20, 44]) {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(42, y, 8);
    g.fillStyle(0x1b1612, 1);
    g.fillCircle(45, y, 4);
  }
  g.generateTexture(`head-${style.slot}`, ART, ART);
  g.destroy();
}

function makeSilhouettes(scene: Phaser.Scene): void {
  const body = scene.make.graphics({}, false);
  body.fillStyle(0xffffff, 1);
  body.fillRoundedRect(0, 0, ART, ART, 22);
  body.generateTexture('outline-body', ART, ART);
  body.destroy();
}

function makeFood(scene: Phaser.Scene): void {
  const apple = scene.make.graphics({}, false);
  apple.fillStyle(0xd7322b, 1);
  apple.fillCircle(32, 36, 20);
  apple.fillStyle(0xffffff, 0.35);
  apple.fillCircle(25, 29, 6);
  apple.fillStyle(0x4f8a3b, 1);
  apple.fillEllipse(38, 12, 18, 10);
  apple.generateTexture('food-apple', ART, ART);
  apple.destroy();

  const golden = scene.make.graphics({}, false);
  golden.fillStyle(0xffd24a, 1);
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 28 : 13;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(new Phaser.Geom.Point(32 + Math.cos(a) * r, 32 + Math.sin(a) * r));
  }
  golden.fillPoints(pts, true);
  golden.lineStyle(3, 0x9a6a00, 1);
  golden.strokePoints(pts, true);
  golden.generateTexture('food-golden', ART, ART);
  golden.destroy();

  const pellet = scene.make.graphics({}, false);
  pellet.fillStyle(0xf3e6d3, 1);
  pellet.fillCircle(32, 32, 9);
  pellet.lineStyle(3, 0x6d5a45, 1);
  pellet.strokeCircle(32, 32, 9);
  pellet.generateTexture('food-pellet', ART, ART);
  pellet.destroy();
}

function makePowerUps(scene: Phaser.Scene): void {
  const surge = scene.make.graphics({}, false);
  surge.fillStyle(0xf2b134, 1);
  surge.fillRoundedRect(4, 4, 56, 56, 14);
  surge.fillStyle(0x3d2800, 1);
  surge.fillPoints(
    [
      new Phaser.Geom.Point(36, 8),
      new Phaser.Geom.Point(16, 36),
      new Phaser.Geom.Point(30, 36),
      new Phaser.Geom.Point(26, 56),
      new Phaser.Geom.Point(48, 26),
      new Phaser.Geom.Point(34, 26),
    ],
    true,
  );
  surge.generateTexture('power-surge', ART, ART);
  surge.destroy();

  const aegis = scene.make.graphics({}, false);
  aegis.fillStyle(0x4da3e0, 1);
  aegis.fillRoundedRect(4, 4, 56, 56, 14);
  aegis.fillStyle(0x062a45, 1);
  aegis.fillPoints(
    [
      new Phaser.Geom.Point(32, 10),
      new Phaser.Geom.Point(50, 18),
      new Phaser.Geom.Point(48, 38),
      new Phaser.Geom.Point(32, 54),
      new Phaser.Geom.Point(16, 38),
      new Phaser.Geom.Point(14, 18),
    ],
    true,
  );
  aegis.generateTexture('power-aegis', ART, ART);
  aegis.destroy();

  const trim = scene.make.graphics({}, false);
  trim.fillStyle(0xa678de, 1);
  trim.fillRoundedRect(4, 4, 56, 56, 14);
  trim.fillStyle(0x24103f, 1);
  trim.fillRect(14, 18, 36, 7);
  trim.fillRect(14, 28, 22, 7);
  trim.fillRect(14, 38, 10, 7);
  trim.generateTexture('power-trim', ART, ART);
  trim.destroy();
}

/** Builds every texture the arena needs. Nothing is loaded from disk, so there is nothing to fail offline. */
export function generateTextures(scene: Phaser.Scene, patterned: boolean): void {
  for (const style of SNAKE_STYLES) {
    makeSegment(scene, style, patterned);
    makeHead(scene, style);
  }
  makeSilhouettes(scene);
  makeFood(scene);
  makePowerUps(scene);
}
