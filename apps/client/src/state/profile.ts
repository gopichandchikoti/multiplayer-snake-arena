import type { RoundResult } from '@snake/shared';
import { createStore, type Store } from './store';
import { safeStorage } from './settings';

export interface Tally {
  rounds: number;
  wins: number;
  bestScore: number;
}

/** Personal records kept in this browser only: offline practice and online rounds are counted apart. */
export interface Profile {
  practice: Tally;
  online: Tally;
}

export const PROFILE_KEY = 'coilyard.profile.v1';

const empty = (): Tally => ({ rounds: 0, wins: 0, bestScore: 0 });
export const emptyProfile = (): Profile => ({ practice: empty(), online: empty() });

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

function parseRecord(raw: unknown): Tally {
  if (typeof raw !== 'object' || raw === null) return empty();
  const r: { [key: string]: unknown } = { ...raw };
  return { rounds: count(r.rounds), wins: count(r.wins), bestScore: count(r.bestScore) };
}

export function parseProfile(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) return emptyProfile();
  const r: { [key: string]: unknown } = { ...raw };
  return { practice: parseRecord(r.practice), online: parseRecord(r.online) };
}

export function loadProfile(storage: Pick<Storage, 'getItem'> | null): Profile {
  if (!storage) return emptyProfile();
  try {
    const text = storage.getItem(PROFILE_KEY);
    return text ? parseProfile(JSON.parse(text)) : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

/** The profile after one more round in which the player finished with `standing`. */
export function withRound(profile: Profile, mode: keyof Profile, result: RoundResult, slot: number): Profile {
  const standing = result.standings.find((s) => s.slot === slot);
  if (!standing) return profile;
  const before = profile[mode];
  return {
    ...profile,
    [mode]: {
      rounds: before.rounds + 1,
      wins: before.wins + (standing.rank === 1 ? 1 : 0),
      bestScore: Math.max(before.bestScore, standing.score),
    },
  };
}

export const profileStore: Store<Profile> = createStore(loadProfile(safeStorage()));

profileStore.subscribe(() => {
  try {
    safeStorage()?.setItem(PROFILE_KEY, JSON.stringify(profileStore.get()));
  } catch {
    // Storage is full or blocked; records simply last for this visit.
  }
});

const counted = new WeakSet<RoundResult>();

/** Counts a finished round once, however many times a screen renders or an effect re-runs. */
export function recordRound(mode: keyof Profile, result: RoundResult, slot: number | null): void {
  if (slot === null || counted.has(result)) return;
  counted.add(result);
  profileStore.update((p) => withRound(p, mode, result, slot));
}
