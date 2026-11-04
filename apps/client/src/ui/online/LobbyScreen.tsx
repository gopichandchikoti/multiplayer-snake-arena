import { useEffect, useState } from 'react';
import { MIN_PLAYERS, type RoomPlayer, type RoomView, type ThemeId } from '@snake/shared';
import { THEMES } from '../../game/palette';
import { inviteLink } from '../../net/createOnline';
import type { ClockSync } from '../../net/clockSync';
import { SnakeSwatch } from '../SnakeSwatch';
import { ThemeCards } from '../PracticeSetup';

interface Props {
  room: RoomView;
  meId: string;
  clock: ClockSync;
  onReady: (ready: boolean) => void;
  onTheme: (theme: ThemeId) => void;
  onLeave: () => void;
}

/** "Starting in N" while the server's countdown runs, derived from the synchronised server clock. */
export function CountdownText({ endsAt, clock }: { endsAt: number; clock: ClockSync }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(performance.now());
    }, 150);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const left = Math.max(1, Math.ceil((endsAt - clock.serverNow(now)) / 1000));
  return <p role="status">Starting in {left}...</p>;
}

function PlayerRow({ player, meId, hostId }: { player: RoomPlayer; meId: string; hostId: string }) {
  const status = player.connected ? (player.ready ? 'Ready' : 'Not ready') : 'Reconnecting...';
  return (
    <li className={`standing standing--lobby${player.id === meId ? ' standing--local' : ''}`}>
      {player.slot === null ? <span aria-hidden="true" /> : <SnakeSwatch slot={player.slot} />}
      <span className="standing__name">
        {player.nick}
        {player.id === meId ? ' (you)' : ''}
        {player.id === hostId ? ' · host' : ''}
      </span>
      <span className="standing__stat">{player.role === 'spectator' ? 'Watching' : status}</span>
    </li>
  );
}

function CopyInvite({ code }: { code: string }) {
  const [message, setMessage] = useState('');
  const copy = (): void => {
    const link = inviteLink(window.location, code);
    navigator.clipboard.writeText(link).then(
      () => {
        setMessage('Invite link copied.');
      },
      () => {
        setMessage(`Copy this link: ${link}`);
      },
    );
  };
  return (
    <div className="row">
      <button type="button" className="btn" onClick={copy}>
        Copy invite link
      </button>
      <span role="status" className="field__hint">
        {message}
      </span>
    </div>
  );
}

function LobbyActions({ me, onReady, onLeave }: { me: RoomPlayer | undefined } & Pick<Props, 'onReady' | 'onLeave'>) {
  return (
    <div className="row">
      {me?.role === 'player' ? (
        <button
          type="button"
          className="btn btn--primary"
          aria-pressed={me.ready}
          onClick={() => {
            onReady(!me.ready);
          }}
        >
          {me.ready ? 'Not ready' : 'Ready'}
        </button>
      ) : (
        <p className="field__hint">You will join the next round when a seat is free.</p>
      )}
      <button type="button" className="btn" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}

export function LobbyScreen({ room, meId, clock, onReady, onTheme, onLeave }: Props) {
  const me = room.players.find((p) => p.id === meId);
  const seated = room.players.filter((p) => p.role === 'player');
  const watchers = room.players.length - seated.length;
  const isHost = room.hostId === meId;
  return (
    <main id="main" className="menu">
      <section className="panel" aria-labelledby="lobby-title">
        <h1 id="lobby-title" className="panel__title">
          Room <span className="code">{room.code}</span>
        </h1>
        <p className="field__hint">
          {room.visibility === 'public'
            ? 'Public room: anyone using Quick play can join.'
            : 'Private room: share the code or link.'}
        </p>
        <CopyInvite code={room.code} />
        <ul className="standings" aria-label={`Players, ${seated.length} of ${room.maxPlayers}`}>
          {room.players.map((p) => (
            <PlayerRow key={p.id} player={p} meId={meId} hostId={room.hostId} />
          ))}
        </ul>
        {watchers > 0 ? <p className="field__hint">{watchers} watching</p> : null}
        {isHost ? (
          <ThemeCards value={room.theme} onChange={onTheme} />
        ) : (
          <p className="field__hint">Arena: {THEMES[room.theme].label} (chosen by the host)</p>
        )}
        {room.phase === 'countdown' && room.countdownEndsAt !== null ? (
          <CountdownText endsAt={room.countdownEndsAt} clock={clock} />
        ) : (
          <p className="field__hint">The round starts 3 seconds after at least {MIN_PLAYERS} players are all ready.</p>
        )}
        <LobbyActions me={me} onReady={onReady} onLeave={onLeave} />
      </section>
    </main>
  );
}
