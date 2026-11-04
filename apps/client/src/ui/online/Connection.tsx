import type { SessionState } from '../../net/onlineSession';

interface ViewProps {
  state: SessionState;
  onRetry: () => void;
  onBack: () => void;
}

function describe(state: SessionState): { title: string; detail: string; busy: boolean } {
  const { state: connection, attempt, retryInMs } = state.connection;
  if (state.farewell === 'replaced') {
    return { title: 'Opened somewhere else', detail: 'This game was opened in another tab or window.', busy: false };
  }
  switch (connection) {
    case 'failed':
      return { title: 'Cannot reach the server', detail: 'Check your connection, then try again.', busy: false };
    case 'reconnecting': {
      const wait = retryInMs === null ? '' : ` Trying again in ${Math.max(1, Math.round(retryInMs / 1000))} s.`;
      return { title: 'Connection lost', detail: `Reconnecting (attempt ${attempt}).${wait}`, busy: true };
    }
    case 'closed':
      return { title: 'Disconnected', detail: 'You are not connected to the server.', busy: false };
    default:
      return { title: 'Connecting', detail: 'Reaching the game server...', busy: true };
  }
}

/** Full-screen state shown before there is a connection to play on. */
export function ConnectingView({ state, onRetry, onBack }: ViewProps) {
  const { title, detail, busy } = describe(state);
  return (
    <main id="main" className="menu">
      <section className="panel" aria-labelledby="conn-title" aria-busy={busy}>
        <h1 id="conn-title" className="panel__title">
          {title}
        </h1>
        <p role="status">{detail}</p>
        {state.notice ? <p role="alert">{state.notice.message}</p> : null}
        <p className="field__hint">Online play needs the game server. Offline practice works without it.</p>
        <div className="row">
          {busy ? null : (
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              Try again
            </button>
          )}
          <button type="button" className="btn" onClick={onBack}>
            Back to menu
          </button>
        </div>
      </section>
    </main>
  );
}

/** Slim bar shown on top of a lobby or match when the socket drops; the seat is held while it reconnects. */
export function ConnectionBanner({ state, onRetry }: Pick<ViewProps, 'state' | 'onRetry'>) {
  if (state.connection.state === 'open') return null;
  const { title, detail, busy } = describe(state);
  return (
    <div className="banner" role="status">
      <strong>{title}.</strong> <span>{detail}</span>{' '}
      {busy ? null : (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
