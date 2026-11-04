import { useEffect, useRef } from 'react';
import type { RoundResult, Standing } from '@snake/shared';
import type { RosterEntry } from '../game/source';
import { describeReason, ordinal } from '../util/format';
import { SnakeSwatch } from './SnakeSwatch';

interface Props {
  result: RoundResult;
  roster: readonly RosterEntry[];
  offline: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  onMenu: () => void;
  /** Extra line under the result, e.g. what happens next online. */
  note?: string;
}

function headline(result: RoundResult, roster: readonly RosterEntry[]): string {
  const winners = roster.filter((r) => result.winnerSlots.includes(r.slot));
  if (winners.length !== 1) return result.winnerSlots.length === 0 ? 'No winner' : 'It is a draw';
  const [winner] = winners;
  return winner?.isLocal ? 'You win!' : `${winner?.name ?? 'Someone'} wins`;
}

function StandingRow({ standing, entry }: { standing: Standing; entry: RosterEntry | undefined }) {
  const crashes = standing.kills === 1 ? 'crash caused' : 'crashes caused';
  return (
    <li className={`standing${entry?.isLocal ? ' standing--local' : ''}`}>
      <span className="standing__rank">{ordinal(standing.rank)}</span>
      <SnakeSwatch slot={standing.slot} />
      <span className="standing__name">{entry?.name ?? `Player ${standing.slot + 1}`}</span>
      <span className="standing__stat">
        {standing.kills} {crashes} · length {standing.length}
      </span>
      <span className="standing__score">{standing.score}</span>
    </li>
  );
}

export function SummaryScreen({ result, roster, offline, primaryLabel, onPrimary, onMenu, note }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Moving focus to the result lets screen-reader users hear it without hunting for it.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="summary">
      <section className="panel summary__card" aria-labelledby="summary-title">
        <h1 id="summary-title" ref={heading} tabIndex={-1}>
          {headline(result, roster)}
        </h1>
        <p className="field__hint">{describeReason(result.reason)}</p>
        {note ? <p className="field__hint">{note}</p> : null}
        {offline ? <span className="badge">Offline practice · not ranked</span> : null}
        <ol className="standings" aria-label="Final standings">
          {result.standings.map((standing) => (
            <StandingRow key={standing.slot} standing={standing} entry={roster.find((r) => r.slot === standing.slot)} />
          ))}
        </ol>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" className="btn" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </section>
    </main>
  );
}
