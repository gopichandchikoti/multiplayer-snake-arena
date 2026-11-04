import Phaser from 'phaser';
import { ArenaScene, type SceneDeps } from './ArenaScene';

export interface ArenaHandle {
  resize(cssWidth: number, cssHeight: number): void;
  destroy(): void;
}

/**
 * Starts Phaser inside `parent`. The canvas is sized in device pixels and shown at 1/dpr so lines
 * stay sharp on high-density screens. Phaser's own input is off: the page handles keys and touch.
 */
export function createArenaGame(parent: HTMLElement, deps: SceneDeps): ArenaHandle {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(parent.clientWidth * dpr));
  const height = Math.max(1, Math.floor(parent.clientHeight * dpr));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    transparent: false,
    backgroundColor: '#141b23',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    scene: new ArenaScene(deps),
    banner: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
  });
  return {
    resize(cssWidth, cssHeight) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      game.scale.setZoom(1 / ratio);
      game.scale.resize(Math.max(1, Math.floor(cssWidth * ratio)), Math.max(1, Math.floor(cssHeight * ratio)));
    },
    destroy() {
      game.destroy(true);
    },
  };
}
