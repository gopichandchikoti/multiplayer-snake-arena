import type { ThemeId } from '@snake/shared';

export type MotionPreference = 'system' | 'reduced' | 'full';
export type ColorScheme = 'system' | 'dark' | 'light';
export type DpadMode = 'auto' | 'on' | 'off';

export interface Settings {
  nickname: string;
  guestId: string;
  theme: ThemeId;
  sound: boolean;
  volume: number;
  motion: MotionPreference;
  colorScheme: ColorScheme;
  dpad: DpadMode;
  dpadSide: 'left' | 'right';
  /** Draw pattern markings on snakes (they are the colour-independent cue; turn off for a plain look). */
  patterns: boolean;
}

export const STORAGE_KEY = 'coilyard.settings.v1';

function newGuestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function defaultSettings(): Settings {
  return {
    nickname: '',
    guestId: newGuestId(),
    theme: 'parchment',
    sound: true,
    volume: 0.6,
    motion: 'system',
    colorScheme: 'system',
    dpad: 'auto',
    dpadSide: 'right',
    patterns: true,
  };
}

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.some((a) => a === value);

const text = (value: unknown, fallback: string, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : fallback;
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && value >= 0 && value <= 1 ? value : fallback;
const guestId = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : fallback;
const choice = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  isOneOf(value, allowed) ? value : fallback;

/** Accepts only well-formed saved values; anything missing or corrupt falls back to the default. */
export function parseSettings(raw: unknown, fallback: Settings): Settings {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r: Record<string, unknown> = { ...raw };
  return {
    nickname: text(r.nickname, fallback.nickname, 32),
    guestId: guestId(r.guestId, fallback.guestId),
    theme: choice(r.theme, ['parchment', 'kiln', 'tidepool'] as const, fallback.theme),
    sound: flag(r.sound, fallback.sound),
    volume: unit(r.volume, fallback.volume),
    motion: choice(r.motion, ['system', 'reduced', 'full'] as const, fallback.motion),
    colorScheme: choice(r.colorScheme, ['system', 'dark', 'light'] as const, fallback.colorScheme),
    dpad: choice(r.dpad, ['auto', 'on', 'off'] as const, fallback.dpad),
    dpadSide: choice(r.dpadSide, ['left', 'right'] as const, fallback.dpadSide),
    patterns: flag(r.patterns, fallback.patterns),
  };
}

/** Reads saved settings; storage can be missing, blocked or hold garbage, and none of that may break the app. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  const fallback = defaultSettings();
  if (!storage) return fallback;
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? parseSettings(JSON.parse(text), fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, settings: Settings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(settings: Pick<Settings, 'motion'>, systemReduces: boolean): boolean {
  if (settings.motion === 'reduced') return true;
  return settings.motion === 'system' && systemReduces;
}
