import type Phaser from 'phaser';
import type { Vec } from '@snake/shared';

/**
 * Short-lived visual feedback. When `calm()` is true (reduced motion) nothing travels or shakes:
 * cues become brief fades in place, so the information is the same without the movement.
 */
export class Effects {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly calm: () => boolean,
  ) {}

  burst(at: Vec, color: number, size: number, count = 8): void {
    if (this.calm()) return this.flash(at, color, size * 0.5);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dot = this.scene.add.circle(at.x, at.y, size * 0.14, color).setDepth(20);
      this.scene.tweens.add({
        targets: dot,
        x: at.x + Math.cos(angle) * size * 0.9,
        y: at.y + Math.sin(angle) * size * 0.9,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  ring(at: Vec, color: number, size: number): void {
    const ring = this.scene.add
      .circle(at.x, at.y, size * 0.5)
      .setStrokeStyle(Math.max(2, size * 0.12), color)
      .setDepth(20);
    const calm = this.calm();
    this.scene.tweens.add({
      targets: ring,
      scale: calm ? 1 : 2.4,
      alpha: 0,
      duration: calm ? 250 : 420,
      onComplete: () => ring.destroy(),
    });
  }

  floatText(at: Vec, text: string, color: string, size: number): void {
    const label = this.scene.add
      .text(at.x, at.y, text, { fontFamily: 'Bricolage Grotesque Variable, sans-serif', fontStyle: '800', color })
      .setFontSize(Math.max(12, size * 0.8))
      .setOrigin(0.5)
      .setStroke('#141b23', 4)
      .setDepth(21);
    this.scene.tweens.add({
      targets: label,
      y: at.y - (this.calm() ? 0 : size * 1.4),
      alpha: 0,
      duration: 800,
      delay: 120,
      onComplete: () => label.destroy(),
    });
  }

  scatter(points: readonly Vec[], color: number, size: number): void {
    const calm = this.calm();
    points.forEach((p, i) => {
      if (i % 2 === 1) return;
      const piece = this.scene.add.rectangle(p.x, p.y, size * 0.7, size * 0.7, color).setDepth(19);
      this.scene.tweens.add({
        targets: piece,
        x: p.x + (calm ? 0 : (Math.random() - 0.5) * size * 3),
        y: p.y + (calm ? 0 : (Math.random() - 0.5) * size * 3),
        angle: calm ? 0 : Math.random() * 180 - 90,
        alpha: 0,
        duration: 650,
        delay: i * 6,
        onComplete: () => piece.destroy(),
      });
    });
  }

  shake(): void {
    if (!this.calm()) this.scene.cameras.main.shake(140, 0.004);
  }

  private flash(at: Vec, color: number, size: number): void {
    const dot = this.scene.add.circle(at.x, at.y, size, color, 0.8).setDepth(20);
    this.scene.tweens.add({ targets: dot, alpha: 0, duration: 200, onComplete: () => dot.destroy() });
  }
}
