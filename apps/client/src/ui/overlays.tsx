import type { Dir } from '@snake/shared';

const DPAD: ReadonlyArray<{ dir: Dir; label: string; glyph: string; area: string }> = [
  { dir: 0, label: 'Turn up', glyph: '▲', area: '1 / 2' },
  { dir: 3, label: 'Turn left', glyph: '◀', area: '2 / 1' },
  { dir: 2, label: 'Turn down', glyph: '▼', area: '2 / 2' },
  { dir: 1, label: 'Turn right', glyph: '▶', area: '2 / 3' },
];

export function CountdownOverlay({ count }: { count: number }) {
  return (
    <div className="overlay" aria-live="assertive">
      <p className="overlay__count" key={count}>
        {count}
      </p>
      <p>Get ready to steer</p>
    </div>
  );
}

interface PauseProps {
  onResume: () => void;
  onQuit: () => void;
}

export function PauseOverlay({ onResume, onQuit }: PauseProps) {
  return (
    <div className="overlay">
      <h2>Paused</h2>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn--primary" onClick={onResume}>
          Resume
        </button>
        <button type="button" className="btn" onClick={onQuit}>
          Quit practice
        </button>
      </div>
    </div>
  );
}

interface PadProps {
  side: 'left' | 'right';
  onTurn: (dir: Dir) => void;
}

/** On-screen steering pad in a keyboard-arrow arrangement; it sits below the arena, never over it. */
export function SteeringPad({ side, onTurn }: PadProps) {
  return (
    <div className={`padbar padbar--${side}`}>
      <div className="dpad" role="group" aria-label="Steering pad">
        {DPAD.map((button) => (
          <button
            key={button.dir}
            type="button"
            aria-label={button.label}
            style={{ gridArea: button.area }}
            onPointerDown={(event) => {
              event.preventDefault();
              onTurn(button.dir);
            }}
          >
            {button.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
