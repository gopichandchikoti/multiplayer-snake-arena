import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Modal } from '../primitives';

const boardSchema = z.object({
  persistence: z.enum(['memory', 'file']),
  scope: z.literal('this-server'),
  since: z.string(),
  entries: z.array(
    z.object({
      rank: z.number(),
      nick: z.string(),
      wins: z.number(),
      matches: z.number(),
      bestScore: z.number(),
      totalScore: z.number(),
    }),
  ),
});
type Board = z.infer<typeof boardSchema>;

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; board: Board };

export async function fetchLeaderboard(fetcher: typeof fetch = fetch): Promise<Board> {
  const response = await fetcher('/api/leaderboard', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return boardSchema.parse(await response.json());
}

function Table({ board }: { board: Board }) {
  const note =
    board.persistence === 'file'
      ? 'Saved on the server and kept across restarts.'
      : 'Kept in memory: resets when the server restarts.';
  return (
    <>
      <p className="field__hint">
        Top players on this server since {new Date(board.since).toLocaleDateString()}. {note} It is not a global
        ranking.
      </p>
      {board.entries.length === 0 ? (
        <p>No ranked rounds have been played yet. Win a round against other people to appear here.</p>
      ) : (
        <table className="table">
          <caption className="sr-only">Leaderboard for this server</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Wins</th>
              <th scope="col">Rounds</th>
              <th scope="col">Best</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((entry) => (
              <tr key={entry.rank}>
                <td>{entry.rank}</td>
                <th scope="row">{entry.nick}</th>
                <td>{entry.wins}</td>
                <td>{entry.matches}</td>
                <td>{entry.bestScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function LeaderboardPanel({ onClose, fetcher }: { onClose: () => void; fetcher?: typeof fetch }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = (): void => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    let current = true;
    fetchLeaderboard(fetcher).then(
      (board) => {
        if (current) setLoad({ status: 'ready', board });
      },
      () => {
        if (current) setLoad({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [fetcher, attempt]);

  return (
    <Modal title="Leaderboard" onClose={onClose}>
      {load.status === 'loading' ? <p role="status">Loading the leaderboard...</p> : null}
      {load.status === 'error' ? (
        <div role="alert" className="stack">
          <p>The leaderboard could not be loaded. The server may be offline.</p>
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
      {load.status === 'ready' ? <Table board={load.board} /> : null}
    </Modal>
  );
}
