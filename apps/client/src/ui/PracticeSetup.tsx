import { useState } from 'react';
import type { BotLevel, ThemeId } from '@snake/shared';
import { THEMES, THEME_IDS, hexToInt } from '../game/palette';
import type { PracticeOptions } from '../game/practice';
import { Segmented, Stepper } from './primitives';

const LEVELS = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
] as const;

interface Props {
  playerName: string;
  initialTheme: ThemeId;
  onStart: (options: Omit<PracticeOptions, 'seed'>) => void;
  onBack: () => void;
}

export function ThemeCards({ value, onChange }: { value: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <fieldset className="field">
      <legend className="legend">Arena</legend>
      <div className="theme-cards">
        {THEME_IDS.map((id) => {
          const theme = THEMES[id];
          return (
            <label key={id} className="theme-card">
              <input
                type="radio"
                name="arena-theme"
                value={id}
                checked={value === id}
                onChange={() => {
                  onChange(id);
                }}
              />
              <span className="theme-card__swatch" aria-hidden="true">
                {[theme.board, theme.boardAlt, theme.outline, theme.frame].map((color, i) => (
                  <span key={i} style={{ background: `#${hexToInt(color).toString(16).padStart(6, '0')}` }} />
                ))}
              </span>
              <span className="theme-card__name">{theme.label}</span>
              <span className="theme-card__blurb">{theme.blurb}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PracticeSetup({ playerName, initialTheme, onStart, onBack }: Props) {
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<BotLevel>('normal');
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  return (
    <section className="panel" aria-labelledby="practice-title">
      <h2 id="practice-title" className="panel__title">
        Practice against bots
      </h2>
      <p className="field__hint">
        Runs entirely in this browser with the same rules as online play. Results are never ranked or sent anywhere.
      </p>
      <Stepper label="Bots" value={bots} min={1} max={7} onChange={setBots} />
      <Segmented legend="Difficulty" name="level" value={level} options={LEVELS} onChange={setLevel} />
      <ThemeCards value={theme} onChange={setTheme} />
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onStart({ bots, level, theme, playerName });
          }}
        >
          Start practice
        </button>
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
