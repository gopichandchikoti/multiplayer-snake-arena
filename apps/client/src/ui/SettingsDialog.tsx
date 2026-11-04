import { useId } from 'react';
import { settingsStore, useSettings, useStore } from '../state/app';
import { PROFILE_KEY, emptyProfile, profileStore, type Tally } from '../state/profile';
import { STORAGE_KEY, defaultSettings, safeStorage, type Settings } from '../state/settings';
import { NameField } from './NameField';
import { ThemeCards } from './PracticeSetup';
import { Modal, Segmented, Switch, type Option } from './primitives';

/** Returns a setter for one saved setting, so each control stays a one-liner. */
function setter<K extends keyof Settings>(key: K): (value: Settings[K]) => void {
  return (value) => {
    settingsStore.update((s) => ({ ...s, [key]: value }));
  };
}

const SCHEMES: readonly Option<Settings['colorScheme']>[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];
const MOTION: readonly Option<Settings['motion']>[] = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
];
const PAD: readonly Option<Settings['dpad']>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];
const SIDES: readonly Option<Settings['dpadSide']>[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

function Appearance({ settings }: { settings: Settings }) {
  return (
    <>
      <ThemeCards value={settings.theme} onChange={setter('theme')} />
      <Segmented
        legend="Colour scheme"
        name="scheme"
        value={settings.colorScheme}
        options={SCHEMES}
        onChange={setter('colorScheme')}
      />
      <Segmented legend="Motion" name="motion" value={settings.motion} options={MOTION} onChange={setter('motion')} />
      <Switch
        label="Pattern markings on snakes"
        hint="Stripes, dots and more tell snakes apart without colour."
        checked={settings.patterns}
        onChange={setter('patterns')}
      />
    </>
  );
}

function Sound({ settings }: { settings: Settings }) {
  const volumeId = useId();
  return (
    <>
      <Switch label="Sound effects" checked={settings.sound} onChange={setter('sound')} />
      <div className="field">
        <label className="field__label" htmlFor={volumeId}>
          Volume
        </label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          disabled={!settings.sound}
          onChange={(event) => {
            setter('volume')(Number(event.target.value));
          }}
        />
      </div>
    </>
  );
}

function RecordLine({ label, record }: { label: string; record: Tally }) {
  return (
    <li>
      <strong>{label}:</strong> {record.rounds} rounds, {record.wins} wins, best score {record.bestScore}
    </li>
  );
}

function RecordsSection() {
  const profile = useStore(profileStore);
  return (
    <section className="field" aria-labelledby="records-title">
      <span id="records-title" className="field__label">
        Your records (this browser only)
      </span>
      <ul className="help-grid">
        <RecordLine label="Online" record={profile.online} />
        <RecordLine label="Practice" record={profile.practice} />
      </ul>
    </section>
  );
}

function SavedData() {
  const reset = (): void => {
    if (!window.confirm('Reset all saved settings and create a new guest ID?')) return;
    try {
      safeStorage()?.removeItem(STORAGE_KEY);
      safeStorage()?.removeItem(PROFILE_KEY);
    } catch {
      // Storage is blocked: the in-memory reset below still applies for this visit.
    }
    settingsStore.set(defaultSettings());
    profileStore.set(emptyProfile());
  };
  return (
    <div className="field">
      <span className="field__label">Saved data</span>
      <span className="field__hint">
        Settings and a random guest ID are stored in this browser only. No account, no tracking.
      </span>
      <button type="button" className="btn" onClick={reset}>
        Reset saved data
      </button>
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  return (
    <Modal title="Settings" onClose={onClose}>
      <NameField hint="2 to 16 letters or numbers. Other players see this name." />
      <Appearance settings={settings} />
      <Sound settings={settings} />
      <Segmented legend="Steering pad" name="dpad" value={settings.dpad} options={PAD} onChange={setter('dpad')} />
      <Segmented
        legend="Steering pad side"
        name="dpad-side"
        value={settings.dpadSide}
        options={SIDES}
        onChange={setter('dpadSide')}
      />
      <RecordsSection />
      <SavedData />
    </Modal>
  );
}
