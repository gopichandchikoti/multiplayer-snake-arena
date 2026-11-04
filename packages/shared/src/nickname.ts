import { NICKNAME_MAX, NICKNAME_MIN } from './constants';

/** Control (Cc), format (Cf: zero-width, bidi overrides, soft hyphen, BOM) and line/paragraph separators. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const DISALLOWED = /[^\p{L}\p{M}\p{N} _.'-]/gu;
/** Names in many scripts need combining marks; long stacks of them ("zalgo") are cut to two. */
const MARK_STACK = /(\p{M}{2})\p{M}+/gu;
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'server', 'system', 'official', 'staff']);

/**
 * Cleans a player-chosen nickname for display. Returns null when nothing usable is left.
 * Nicknames only ever reach the page as text, but they are also logged and shown to other
 * players, so control characters, bidi overrides, markup characters and emoji are removed.
 */
export function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFKC')
    .replace(INVISIBLE, ' ')
    .replace(DISALLOWED, '')
    .replace(MARK_STACK, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  const length = Array.from(cleaned).length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return null;
  if (RESERVED.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

export function fallbackNickname(seed: number): string {
  return `Guest ${String(1000 + (seed % 9000))}`;
}
