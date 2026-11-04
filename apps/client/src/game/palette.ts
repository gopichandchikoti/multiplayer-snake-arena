import type { PowerUpKind, ThemeId } from '@snake/shared';

export type PatternId = 'solid' | 'stripes' | 'dots' | 'chevrons' | 'checks' | 'rings' | 'diamonds' | 'hatch';

/** Every snake has a fill colour AND a pattern, so players are never told apart by hue alone. */
export interface SnakeStyle {
  slot: number;
  label: string;
  fill: string;
  mark: string;
  pattern: PatternId;
}

export const SNAKE_STYLES: readonly SnakeStyle[] = [
  { slot: 0, label: 'Amber', fill: '#F2B134', mark: '#7A4B00', pattern: 'solid' },
  { slot: 1, label: 'Coral', fill: '#E4572E', mark: '#FFF1E6', pattern: 'stripes' },
  { slot: 2, label: 'Moss', fill: '#7FB069', mark: '#1F3D1A', pattern: 'dots' },
  { slot: 3, label: 'Sky', fill: '#4DA3E0', mark: '#0B2A44', pattern: 'chevrons' },
  { slot: 4, label: 'Violet', fill: '#A678DE', mark: '#2A1250', pattern: 'checks' },
  { slot: 5, label: 'Rose', fill: '#F48FB1', mark: '#6B1233', pattern: 'rings' },
  { slot: 6, label: 'Teal', fill: '#2EC4B6', mark: '#053B37', pattern: 'diamonds' },
  { slot: 7, label: 'Bone', fill: '#F1ECE0', mark: '#3A332A', pattern: 'hatch' },
];

export function snakeStyle(slot: number): SnakeStyle {
  return SNAKE_STYLES[slot % SNAKE_STYLES.length] ?? SNAKE_STYLES[0] ?? fallbackStyle;
}

const fallbackStyle: SnakeStyle = { slot: 0, label: 'Amber', fill: '#F2B134', mark: '#7A4B00', pattern: 'solid' };

export interface ArenaTheme {
  id: ThemeId;
  label: string;
  blurb: string;
  board: string;
  boardAlt: string;
  grid: string;
  frame: string;
  /** Snake silhouette: ink on light boards, cream on dark ones, so snakes always stand out. */
  outline: string;
  backdrop: string;
}

export const THEMES: Readonly<Record<ThemeId, ArenaTheme>> = {
  parchment: {
    id: 'parchment',
    label: 'Parchment',
    blurb: 'Warm paper board with ink lines. Easiest on the eyes in daylight.',
    board: '#EFE5D0',
    boardAlt: '#E8DCC3',
    grid: '#CDBF9F',
    frame: '#3B2F24',
    outline: '#1B1612',
    backdrop: '#141B23',
  },
  kiln: {
    id: 'kiln',
    label: 'Kiln',
    blurb: 'Fired clay in low light. Warm, dark and calm.',
    board: '#3A2420',
    boardAlt: '#33201C',
    grid: '#52352E',
    frame: '#1A0F0D',
    outline: '#F3E6D3',
    backdrop: '#120B0A',
  },
  tidepool: {
    id: 'tidepool',
    label: 'Tidepool',
    blurb: 'Deep teal water with pale shell lines. Cool and high contrast.',
    board: '#12343B',
    boardAlt: '#0F2E34',
    grid: '#1F4E57',
    frame: '#081A1E',
    outline: '#E6F4F1',
    backdrop: '#06161A',
  },
};

export const THEME_IDS: readonly ThemeId[] = ['parchment', 'kiln', 'tidepool'];

export interface PowerUpStyle {
  kind: PowerUpKind;
  label: string;
  hint: string;
  color: string;
}

export const POWERUP_STYLES: Readonly<Record<PowerUpKind, PowerUpStyle>> = {
  surge: { kind: 'surge', label: 'Surge', hint: 'Twice the speed for 5 seconds', color: '#F2B134' },
  aegis: { kind: 'aegis', label: 'Aegis', hint: 'Absorbs one crash within 12 seconds', color: '#4DA3E0' },
  trim: { kind: 'trim', label: 'Trim', hint: 'Cuts your body in half to escape a tight spot', color: '#A678DE' },
};

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
