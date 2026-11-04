import { beforeEach, describe, expect, it } from 'vitest';
import type { RoundResult } from '@snake/shared';
import {
  PROFILE_KEY,
  emptyProfile,
  loadProfile,
  parseProfile,
  profileStore,
  recordRound,
  withRound,
} from '../src/state/profile';

const result = (scores: Array<[number, number, number]>): RoundResult => ({
  reason: 'timer',
  endedAtTick: 10,
  winnerSlots: [],
  standings: scores.map(([slot, rank, score]) => ({ slot, rank, score, kills: 0, length: 4, alive: true })),
});

beforeEach(() => {
  profileStore.set(emptyProfile());
  window.localStorage.clear();
});

describe('profile', () => {
  it('counts rounds, wins and the best score, per mode', () => {
    let p = emptyProfile();
    p = withRound(
      p,
      'online',
      result([
        [0, 1, 80],
        [1, 2, 20],
      ]),
      0,
    );
    p = withRound(
      p,
      'online',
      result([
        [0, 2, 120],
        [1, 1, 130],
      ]),
      0,
    );
    p = withRound(p, 'practice', result([[0, 1, 15]]), 0);
    expect(p.online).toEqual({ rounds: 2, wins: 1, bestScore: 120 });
    expect(p.practice).toEqual({ rounds: 1, wins: 1, bestScore: 15 });
  });

  it('ignores rounds the player was not part of', () => {
    const p = emptyProfile();
    expect(withRound(p, 'online', result([[1, 1, 50]]), 0)).toBe(p);
  });

  it('records a finished round once, however often it is asked', () => {
    const r = result([[0, 1, 40]]);
    recordRound('practice', r, 0);
    recordRound('practice', r, 0);
    recordRound('practice', result([[0, 1, 10]]), null);
    expect(profileStore.get().practice.rounds).toBe(1);
  });

  it('is saved as it changes and read back safely', () => {
    recordRound('online', result([[0, 1, 40]]), 0);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? '{}')).toMatchObject({ online: { rounds: 1 } });
    expect(loadProfile(window.localStorage).online.bestScore).toBe(40);
  });

  it.each([null, '{bad', '{"online":{"rounds":-4,"wins":"x","bestScore":1e999}}', '[]', '"s"'])(
    'falls back to zeros for corrupt data %s',
    (text) => {
      const storage = { getItem: () => text };
      expect(loadProfile(storage).online).toEqual({ rounds: 0, wins: 0, bestScore: 0 });
    },
  );

  it('survives missing or throwing storage', () => {
    expect(loadProfile(null)).toEqual(emptyProfile());
    expect(
      loadProfile({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(emptyProfile());
    expect(parseProfile(5)).toEqual(emptyProfile());
  });
});
