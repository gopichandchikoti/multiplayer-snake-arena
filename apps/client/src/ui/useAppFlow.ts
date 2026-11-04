import { useCallback, useState } from 'react';
import { PracticeGame, type PracticeOptions } from '../game/practice';
import type { GameSource } from '../game/source';

export type PracticeChoices = Omit<PracticeOptions, 'seed'>;

export type Screen =
  | { name: 'menu' }
  | { name: 'practice-setup' }
  | { name: 'game'; source: GameSource; practice: PracticeChoices }
  | { name: 'summary'; source: GameSource; practice: PracticeChoices };

export interface Flow {
  screen: Screen;
  openSetup: () => void;
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

  const startPractice = (practice: PracticeChoices): void => {
    setScreen({ name: 'game', source: new PracticeGame({ ...practice, seed: randomSeed() }), practice });
  };
  const toMenu = (): void => {
    if (screen.name === 'game' || screen.name === 'summary') screen.source.dispose();
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

  return { screen, openSetup, startPractice, finish, playAgain, toMenu };
}
