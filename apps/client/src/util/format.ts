import type { GameEvent, PowerUpKind, RoundEndReason } from '@snake/shared';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const POWER_NAMES: Readonly<Record<PowerUpKind, string>> = { surge: 'Surge', aegis: 'Aegis', trim: 'Trim' };

type Namer = (slot: number) => string;

function eatText(event: Extract<GameEvent, { type: 'eat' }>): string {
  return `You ate ${event.kind === 'golden' ? 'a golden apple' : 'food'}, plus ${event.points}.`;
}

function deathText(event: Extract<GameEvent, { type: 'die' }>, nameOf: Namer, localSlot: number | null): string {
  const who = event.slot === localSlot ? 'You' : nameOf(event.slot);
  if (event.cause === 'forfeit') return `${who} left the match.`;
  if (event.by === null) return `${who} crashed.`;
  const owner = event.by === localSlot ? 'your' : `${nameOf(event.by)}'s`;
  return `${who} crashed into ${owner} body.`;
}

function bonusText(event: Extract<GameEvent, { type: 'bonus' }>, nameOf: Namer, localSlot: number | null): string {
  const who = event.slot === localSlot ? 'You are' : `${nameOf(event.slot)} is`;
  return `${who} the last snake standing, plus ${event.points}.`;
}

function ownText(event: Extract<GameEvent, { type: 'eat' | 'power' | 'shield-break' }>): string {
  switch (event.type) {
    case 'eat':
      return eatText(event);
    case 'power':
      return `You picked up ${POWER_NAMES[event.kind]}.`;
    case 'shield-break':
      return 'Your Aegis absorbed a crash. Steer away.';
  }
}

/** One short sentence per notable event, for the screen-reader live region. Null means "say nothing". */
export function describeEvent(event: GameEvent, nameOf: Namer, localSlot: number | null): string | null {
  switch (event.type) {
    case 'eat':
    case 'power':
    case 'shield-break':
      return event.slot === localSlot ? ownText(event) : null;
    case 'die':
      return deathText(event, nameOf, localSlot);
    case 'bonus':
      return bonusText(event, nameOf, localSlot);
    case 'spawn-power':
      return `${POWER_NAMES[event.kind]} appeared on the board.`;
  }
}

export function describeReason(reason: RoundEndReason): string {
  switch (reason) {
    case 'timer':
      return 'Time ran out. Highest score wins.';
    case 'last-standing':
      return 'Last snake standing, with a 60 point bonus.';
    case 'all-eliminated':
      return 'Everyone crashed. Highest score wins.';
    case 'ended-early':
      return 'You left the board, so the round was scored as it stood.';
  }
}

export function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  return `${rank}${['th', 'st', 'nd', 'rd'][rank % 10 < 4 ? rank % 10 : 0] ?? 'th'}`;
}
