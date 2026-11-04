import { useCallback, useState } from 'react';
import { createOnlineSession, inviteFromSearch } from '../net/createOnline';
import type { OnlineSession } from '../net/onlineSession';
import { settingsStore } from '../state/app';
import { PracticeGame, type PracticeOptions } from '../game/practice';
import type { GameSource } from '../game/source';

export type PracticeChoices = Omit<PracticeOptions, 'seed'>;

export type Screen =
  | { name: 'menu' }
  | { name: 'practice-setup' }
  | { name: 'game'; source: GameSource; practice: PracticeChoices }
  | { name: 'summary'; source: GameSource; practice: PracticeChoices }
  | { name: 'online'; session: OnlineSession };

export interface Flow {
  screen: Screen;
  /** A room code from an invite link in the address bar, if any. Nothing connects until the player accepts it. */
  invite: string | null;
  openSetup: () => void;
  playOnline: () => void;
  joinInvite: () => void;
  startPractice: (choices: PracticeChoices) => void;
  /** The match ended by itself: show its summary. */
  finish: () => void;
  playAgain: () => void;
  /** Leave whatever is on screen for the main menu, releasing any running match. */
  toMenu: () => void;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Which screen is showing, and how the player moves between them. */
export function useAppFlow(): Flow {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [invite] = useState(() => inviteFromSearch(window.location.search));

  const startPractice = (practice: PracticeChoices): void => {
    setScreen({ name: 'game', source: new PracticeGame({ ...practice, seed: randomSeed() }), practice });
  };
  const toMenu = (): void => {
    if (screen.name === 'game' || screen.name === 'summary') screen.source.dispose();
    if (screen.name === 'online') screen.session.dispose();
    setScreen({ name: 'menu' });
  };
  const playAgain = (): void => {
    if (screen.name !== 'summary') return;
    screen.source.dispose();
    startPractice(screen.practice);
  };
  const finish = useCallback((): void => {
    setScreen((current) => (current.name === 'game' ? { ...current, name: 'summary' } : current));
  }, []);
  const openSetup = (): void => {
    setScreen({ name: 'practice-setup' });
  };
  const connect = (code: string | null): void => {
    const settings = settingsStore.get();
    setScreen({
      name: 'online',
      session: createOnlineSession(() => settingsStore.get().nickname, settings.guestId, code),
    });
  };
  const playOnline = (): void => {
    connect(null);
  };
  const joinInvite = (): void => {
    connect(invite);
  };

  return { screen, invite, openSetup, playOnline, joinInvite, startPractice, finish, playAgain, toMenu };
}
