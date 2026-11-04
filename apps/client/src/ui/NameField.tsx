import { useId } from 'react';
import { settingsStore, useSettings } from '../state/app';

/** The player-name input shared by the menu and Settings; edits are saved as they are typed. */
export function NameField({ hint }: { hint?: string }) {
  const settings = useSettings();
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Your name
      </label>
      <input
        id={id}
        className="input"
        value={settings.nickname}
        maxLength={16}
        autoComplete="nickname"
        placeholder="Guest"
        onChange={(event) => {
          settingsStore.update((s) => ({ ...s, nickname: event.target.value }));
        }}
      />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
