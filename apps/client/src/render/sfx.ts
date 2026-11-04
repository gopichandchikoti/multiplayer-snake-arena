import type { Settings } from '../state/settings';

type Note = readonly [freq: number, start: number, length: number, type: OscillatorType, gain: number];

const SOUNDS: Readonly<Record<string, readonly Note[]>> = {
  eat: [[660, 0, 0.07, 'triangle', 0.5]],
  golden: [
    [784, 0, 0.08, 'triangle', 0.5],
    [1175, 0.07, 0.14, 'triangle', 0.5],
  ],
  power: [
    [392, 0, 0.08, 'square', 0.25],
    [587, 0.07, 0.08, 'square', 0.25],
    [784, 0.14, 0.14, 'square', 0.25],
  ],
  shield: [[220, 0, 0.18, 'sawtooth', 0.3]],
  die: [
    [196, 0, 0.12, 'sawtooth', 0.35],
    [130, 0.1, 0.26, 'sawtooth', 0.35],
  ],
  tick: [[520, 0, 0.05, 'sine', 0.4]],
  go: [[880, 0, 0.2, 'sine', 0.45]],
  win: [
    [523, 0, 0.1, 'triangle', 0.5],
    [659, 0.1, 0.1, 'triangle', 0.5],
    [784, 0.2, 0.1, 'triangle', 0.5],
    [1047, 0.3, 0.3, 'triangle', 0.5],
  ],
};

export type SoundName = keyof typeof SOUNDS;

export interface Sfx {
  play(name: SoundName, loudness?: number): void;
  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void;
}

/** Tiny synthesised effects, so there are no audio files to ship, license or fail to load. */
export function createSfx(getSettings: () => Pick<Settings, 'sound' | 'volume'>): Sfx {
  let ctx: AudioContext | null = null;
  const context = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    unlock() {
      const c = context();
      if (c?.state === 'suspended') void c.resume();
    },
    play(name, loudness = 1) {
      const settings = getSettings();
      const c = settings.sound ? context() : null;
      const notes = SOUNDS[name];
      if (!c || c.state !== 'running' || !notes) return;
      for (const [freq, start, length, type, gain] of notes) {
        const osc = c.createOscillator();
        const amp = c.createGain();
        const at = c.currentTime + start;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        amp.gain.setValueAtTime(0.0001, at);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * settings.volume * loudness * 0.4), at + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
        osc.connect(amp).connect(c.destination);
        osc.start(at);
        osc.stop(at + length + 0.02);
      }
    },
  };
}
