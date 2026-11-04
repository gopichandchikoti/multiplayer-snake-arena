import { useState } from 'react';
import type { RoomView, RoundEndMsg } from '@snake/shared';
import type { RosterEntry } from '../../game/source';
import type { OnlineSession } from '../../net/onlineSession';
import { useSettings, useStore } from '../../state/app';
import { GameScreen } from '../GameScreen';
import { SummaryScreen } from '../SummaryScreen';
import { ConnectingView, ConnectionBanner } from './Connection';
import { LeaderboardPanel } from './LeaderboardPanel';
import { LobbyScreen } from './LobbyScreen';
import { OnlineMenu } from './OnlineMenu';

interface Props {
  session: OnlineSession;
  onExit: () => void;
}

function summaryRoster(room: RoomView, names: Record<string, string>, meId: string | null): RosterEntry[] {
  return Object.entries(names).map(([slot, name]) => ({
    slot: Number(slot),
    name,
    isLocal: room.players.some((p) => p.id === meId && p.slot === Number(slot)),
    isBot: false,
  }));
}

interface SummaryProps extends Props {
  room: RoomView;
  meId: string;
  result: RoundEndMsg;
}

function OnlineSummary({ session, room, meId, result, onExit }: SummaryProps) {
  return (
    <SummaryScreen
      result={result}
      roster={summaryRoster(room, result.names, meId)}
      offline={false}
      primaryLabel="Leave room"
      onPrimary={() => {
        session.leave();
      }}
      onMenu={onExit}
      note="Back to the lobby in a few seconds. Stay to play again."
    />
  );
}

function InRoom({ session, onExit }: Props) {
  const state = useStore(session.state);
  const { room, me, game, result } = state;
  if (!room || !me) return null;
  if (room.phase === 'playing' || (room.phase === 'summary' && !result)) {
    return game ? (
      <GameScreen
        source={game}
        onLeave={() => {
          session.leave();
        }}
        onFinished={() => undefined}
      />
    ) : (
      <ConnectingView
        state={state}
        onRetry={() => {
          session.socket.retryNow();
        }}
        onBack={onExit}
      />
    );
  }
  if (room.phase === 'summary' && result)
    return <OnlineSummary session={session} room={room} meId={me.id} result={result} onExit={onExit} />;
  return (
    <LobbyScreen
      room={room}
      meId={me.id}
      clock={session.socket.clock}
      onReady={(ready) => {
        session.setReady(ready);
      }}
      onTheme={(theme) => {
        session.setTheme(theme);
      }}
      onLeave={() => {
        session.leave();
      }}
    />
  );
}

/** Chooses what to show for the online session: connecting, menu, lobby, match or summary. */
export function OnlineScreen({ session, onExit }: Props) {
  const state = useStore(session.state);
  const settings = useSettings();
  const [showBoard, setShowBoard] = useState(false);
  const retry = (): void => {
    session.socket.retryNow();
  };
  const connected = state.connection.state === 'open' && state.me !== null;
  if (!connected && !state.room) return <ConnectingView state={state} onRetry={retry} onBack={onExit} />;
  return (
    <>
      <ConnectionBanner state={state} onRetry={retry} />
      {state.room ? (
        <InRoom session={session} onExit={onExit} />
      ) : (
        <OnlineMenu
          theme={settings.theme}
          notice={state.notice}
          onQuickplay={() => {
            session.quickplay();
          }}
          onCreate={(visibility) => {
            session.createRoom(visibility, settings.theme);
          }}
          onJoin={(code, spectate) => {
            session.joinRoom(code, spectate);
          }}
          onLeaderboard={() => {
            setShowBoard(true);
          }}
          onDismissNotice={() => {
            session.clearNotice();
          }}
          onBack={onExit}
        />
      )}
      {showBoard ? (
        <LeaderboardPanel
          onClose={() => {
            setShowBoard(false);
          }}
        />
      ) : null}
    </>
  );
}
