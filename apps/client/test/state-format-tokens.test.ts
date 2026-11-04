import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@snake/shared';
import { SNAKE_STYLES, THEMES, THEME_IDS, POWERUP_STYLES, hexToInt, snakeStyle } from '../src/game/palette';
import {
  STORAGE_KEY,
  defaultSettings,
  loadSettings,
  parseSettings,
  prefersReducedMotion,
  saveSettings,
  safeStorage,
} from '../src/state/settings';
import { createStore } from '../src/state/store';
import { contrastRatio, luminance, parseHex } from '../src/util/contrast';
import { describeEvent, describeReason, formatClock, ordinal } from '../src/util/format';

describe('store', () => {
  it('notifies subscribers only when the value changes', () => {
    const store = createStore(1);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
    store.set(2);
    store.update((n) => n + 1);
    expect(store.get()).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.set(9);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('settings', () => {
  it('starts with a fresh random guest ID and sensible defaults', () => {
    const a = defaultSettings();
    const b = defaultSettings();
    expect(a.guestId).toMatch(/^[0-9a-f]{24}$/);
    expect(a.guestId).not.toBe(b.guestId);
    expect(a).toMatchObject({ theme: 'parchment', sound: true, motion: 'system', dpad: 'auto', patterns: true });
  });

  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const settings = { ...defaultSettings(), nickname: 'Ada', theme: 'tidepool' as const, volume: 0.2 };
    expect(saveSettings(storage, settings)).toBe(true);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('falls back field by field when saved data is corrupt', () => {
    const fallback = defaultSettings();
    const parsed = parseSettings(
      {
        nickname: 42,
        guestId: '<x>',
        theme: 'neon',
        sound: 'yes',
        volume: 7,
        motion: 'wild',
        dpadSide: 'up',
        patterns: 1,
      },
      fallback,
    );
    expect(parsed).toEqual(fallback);
    expect(parseSettings(null, fallback)).toBe(fallback);
    expect(parseSettings('text', fallback)).toBe(fallback);
    expect(parseSettings({ nickname: 'x'.repeat(100) }, fallback).nickname).toHaveLength(32);
  });

  it('survives unreadable, unparsable and blocked storage', () => {
    expect(loadSettings(null)).toMatchObject({ theme: 'parchment' });
    expect(loadSettings({ getItem: () => '{not json' })).toMatchObject({ theme: 'parchment' });
    expect(
      loadSettings({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toMatchObject({ theme: 'parchment' });
    expect(saveSettings(null, defaultSettings())).toBe(false);
    expect(
      saveSettings(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        defaultSettings(),
      ),
    ).toBe(false);
    expect(STORAGE_KEY).toContain('settings');
  });

  it('exposes localStorage when available', () => {
    expect(safeStorage()).not.toBeNull();
  });

  it('decides about reduced motion from the setting first, then the system', () => {
    expect(prefersReducedMotion({ motion: 'reduced' }, false)).toBe(true);
    expect(prefersReducedMotion({ motion: 'full' }, true)).toBe(false);
    expect(prefersReducedMotion({ motion: 'system' }, true)).toBe(true);
    expect(prefersReducedMotion({ motion: 'system' }, false)).toBe(false);
  });
});

describe('formatting', () => {
  it('formats the round clock', () => {
    expect(formatClock(120_000)).toBe('2:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('numbers places in English', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });

  it('describes events for screen readers, only the ones that matter to the viewer', () => {
    const name = (slot: number) => ['Ada', 'Pip', 'Marlo'][slot] ?? '?';
    const say = (e: GameEvent, me: number | null = 0) => describeEvent(e, name, me);
    expect(say({ type: 'eat', slot: 0, kind: 'golden', x: 1, y: 1, points: 30 })).toContain('golden apple');
    expect(say({ type: 'eat', slot: 0, kind: 'apple', x: 1, y: 1, points: 10 })).toContain('plus 10');
    expect(say({ type: 'eat', slot: 1, kind: 'apple', x: 1, y: 1, points: 10 })).toBeNull();
    expect(say({ type: 'power', slot: 0, kind: 'aegis', x: 1, y: 1 })).toContain('Aegis');
    expect(say({ type: 'power', slot: 1, kind: 'aegis', x: 1, y: 1 })).toBeNull();
    expect(say({ type: 'shield-break', slot: 0, x: 1, y: 1 })).toContain('absorbed');
    expect(say({ type: 'shield-break', slot: 2, x: 1, y: 1 })).toBeNull();
    expect(say({ type: 'die', slot: 1, cause: 'body', by: 0, x: 1, y: 1, path: '' })).toBe(
      'Pip crashed into your body.',
    );
    expect(say({ type: 'die', slot: 0, cause: 'wall', by: null, x: 1, y: 1, path: '' })).toBe('You crashed.');
    expect(say({ type: 'die', slot: 2, cause: 'body', by: 1, x: 1, y: 1, path: '' })).toBe(
      "Marlo crashed into Pip's body.",
    );
    expect(say({ type: 'die', slot: 2, cause: 'forfeit', by: null, x: 1, y: 1, path: '' })).toBe(
      'Marlo left the match.',
    );
    expect(say({ type: 'bonus', slot: 0, points: 60 })).toContain('You are');
    expect(say({ type: 'bonus', slot: 1, points: 60 }, null)).toContain('Pip is');
    expect(say({ type: 'spawn-power', kind: 'surge', x: 1, y: 1 })).toContain('Surge');
  });

  it('explains how each round ended', () => {
    for (const reason of ['timer', 'last-standing', 'all-eliminated', 'ended-early'] as const) {
      expect(describeReason(reason).length).toBeGreaterThan(10);
    }
  });
});

describe('palette', () => {
  it('gives every seat its own colour AND its own pattern', () => {
    expect(new Set(SNAKE_STYLES.map((s) => s.fill)).size).toBe(8);
    expect(new Set(SNAKE_STYLES.map((s) => s.pattern)).size).toBe(8);
    expect(snakeStyle(9).slot).toBe(1);
    expect(hexToInt('#ff0000')).toBe(0xff0000);
  });

  it('keeps every snake silhouette at least 3:1 against every arena board (WCAG non-text contrast)', () => {
    for (const id of THEME_IDS) {
      const theme = THEMES[id];
      for (const board of [theme.board, theme.boardAlt]) {
        expect(contrastRatio(theme.outline, board), `${id} outline vs ${board}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps pattern marks readable on their fill', () => {
    for (const style of SNAKE_STYLES) {
      expect(contrastRatio(style.mark, style.fill), style.label).toBeGreaterThanOrEqual(3);
    }
  });

  it('describes all three power-ups', () => {
    expect(Object.keys(POWERUP_STYLES).sort()).toEqual(['aegis', 'surge', 'trim']);
  });
});

describe('colour tokens', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');
  const block = (marker: string): Record<string, string> => {
    const start = css.indexOf(`/* scheme:${marker} */`);
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    const vars: Record<string, string> = {};
    for (const [, key, value] of css.slice(open, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
      if (key && value) vars[key] = value;
    }
    return vars;
  };
  const schemes = ['dark', 'light', 'light-system'] as const;

  it.each(schemes)('%s: text, controls and focus meet WCAG AA', (name) => {
    const t = block(name);
    const pair = (a: string, b: string): number => contrastRatio(t[a] ?? '#000000', t[b] ?? '#ffffff');
    for (const surface of ['bg', 'surface', 'surface-raised']) {
      expect(pair('text', surface), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(pair('text-dim', surface), `text-dim on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(pair('danger', surface), `danger on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(pair('success', surface), `success on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const surface of ['bg', 'surface']) {
      expect(pair('border', surface), `border on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(pair('focus', surface), `focus on ${surface}`).toBeGreaterThanOrEqual(3);
    }
    expect(pair('accent-ink', 'accent'), 'button text').toBeGreaterThanOrEqual(4.5);
    expect(pair('accent-ink', 'accent-hover'), 'hovered button text').toBeGreaterThanOrEqual(4.5);
  });

  it('parses and measures colours correctly', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(() => parseHex('red')).toThrow();
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
  });
});
