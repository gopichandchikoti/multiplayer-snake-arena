import type { LagInfo } from '../net/clockSync';
import type { HudSnake, HudState } from '../game/source';
import { formatClock } from '../util/format';
import { SnakeSwatch } from './SnakeSwatch';

function Chip({ snake }: { snake: HudSnake }) {
  const classes = ['chip', snake.isLocal ? 'chip--local' : '', snake.alive ? '' : 'chip--out']
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes}>
      <SnakeSwatch slot={snake.slot} />
      <span className="chip__name">{snake.isLocal ? `${snake.name} (you)` : snake.name}</span>
      <span className="chip__score">{snake.score}</span>
      {snake.alive ? null : <span className="chip__fx">out</span>}
      {snake.alive && snake.surge ? <span className="chip__fx">⚡ surge</span> : null}
      {snake.alive && snake.aegis ? <span className="chip__fx">◈ aegis</span> : null}
    </li>
  );
}

const BARS: Record<LagInfo['level'], string> = { good: '▂▄▆', fair: '▂▄·', poor: '▂··', bad: '···' };
const LEVEL_TEXT: Record<LagInfo['level'], string> = { good: 'Good', fair: 'Fair', poor: 'Poor', bad: 'Bad' };

/** Ping with both bars and a word, so quality never depends on colour. */
function LagBadge({ lag }: { lag: LagInfo }) {
  const text = LEVEL_TEXT[lag.level];
  return (
    <span
      className={`badge badge--lag badge--${lag.level}`}
      aria-label={`Network quality ${text}, ${lag.rtt} milliseconds, jitter ${lag.jitter}`}
    >
      <span aria-hidden="true">{BARS[lag.level]}</span> {lag.rtt} ms <span className="hide-sm">{text}</span>
    </span>
  );
}

interface Props {
  hud: HudState;
  offline: boolean;
  /** True when the viewer has no snake in this round. */
  watching?: boolean;
  onPause?: () => void;
  onLeave: () => void;
}

export function Hud({ hud, offline, watching = false, onPause, onLeave }: Props) {
  // Your own chip stays first so it never scrolls out of view on a narrow screen.
  const ranked = [...hud.snakes].sort(
    (a, b) => Number(b.isLocal) - Number(a.isLocal) || b.score - a.score || a.slot - b.slot,
  );
  return (
    <header className="hud">
      <div className="hud__timer" role="timer" aria-label="Time left">
        {formatClock(hud.remainingMs)}
      </div>
      <ol className="scoreboard" aria-label="Scoreboard">
        {ranked.map((snake) => (
          <Chip key={snake.slot} snake={snake} />
        ))}
      </ol>
      {watching ? <span className="badge">Watching</span> : null}
      {hud.lag ? <LagBadge lag={hud.lag} /> : null}
      {offline ? (
        <span className="badge">
          Offline<span className="hide-sm"> practice · not ranked</span>
        </span>
      ) : null}
      {onPause ? (
        <button type="button" className="btn" onClick={onPause} aria-label={hud.paused ? 'Resume' : 'Pause'}>
          {hud.paused ? 'Resume' : 'Pause'}
        </button>
      ) : null}
      <button type="button" className="btn btn--quiet" onClick={onLeave}>
        Leave
      </button>
    </header>
  );
}
