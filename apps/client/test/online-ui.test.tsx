import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@snake/shared';
import { ClockSync } from '../src/net/clockSync';
import type { SessionState } from '../src/net/onlineSession';
import { settingsStore } from '../src/state/app';
import { defaultSettings } from '../src/state/settings';
import { Hud } from '../src/ui/Hud';
import { MenuScreen } from '../src/ui/MenuScreen';
import { ConnectingView, ConnectionBanner } from '../src/ui/online/Connection';
import { LeaderboardPanel } from '../src/ui/online/LeaderboardPanel';
import { CountdownText, LobbyScreen } from '../src/ui/online/LobbyScreen';
import { OnlineMenu } from '../src/ui/online/OnlineMenu';

vi.mock('../src/ui/ArenaCanvas', () => ({ ArenaCanvas: () => <div data-testid="arena-canvas" /> }));

beforeEach(() => {
  settingsStore.set(defaultSettings());
});

const ROOM: RoomView = {
  code: 'ABCDE',
  phase: 'lobby',
  visibility: 'private',
  theme: 'kiln',
  hostId: 'me',
  players: [
    { id: 'me', nick: 'Ada', slot: 0, ready: false, connected: true, role: 'player' },
    { id: 'bo', nick: 'Bo', slot: 1, ready: true, connected: false, role: 'player' },
    { id: 'sp', nick: 'Watcher', slot: null, ready: false, connected: true, role: 'spectator' },
  ],
  countdownEndsAt: null,
  matchStartedAt: null,
  maxPlayers: 8,
};

function stateWith(over: Partial<SessionState> = {}): SessionState {
  return {
    connection: { state: 'open', attempt: 0, retryInMs: null },
    me: { id: 'me', nick: 'Ada' },
    room: null,
    game: null,
    result: null,
    notice: null,
    farewell: null,
    ...over,
  };
}

describe('connection views', () => {
  it.each([
    [{ state: 'connecting', attempt: 0, retryInMs: null }, 'Connecting', null],
    [{ state: 'reconnecting', attempt: 2, retryInMs: 2400 }, 'Connection lost', /attempt 2.*2 s/],
    [{ state: 'failed', attempt: 13, retryInMs: null }, 'Cannot reach the server', /Check your connection/],
    [{ state: 'closed', attempt: 0, retryInMs: null }, 'Disconnected', null],
  ] as const)('explains %j as "%s"', (connection, title, detail) => {
    render(<ConnectingView state={stateWith({ connection })} onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    if (detail) expect(screen.getByRole('status')).toHaveTextContent(detail);
  });

  it('offers a retry only when waiting would not help, and a way back always', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const { rerender } = render(
      <ConnectingView
        state={stateWith({ connection: { state: 'reconnecting', attempt: 1, retryInMs: 500 } })}
        onRetry={onRetry}
        onBack={onBack}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    rerender(
      <ConnectingView
        state={stateWith({ connection: { state: 'failed', attempt: 13, retryInMs: null } })}
        onRetry={onRetry}
        onBack={onBack}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onRetry).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it('says when the game was opened in another tab', () => {
    render(<ConnectingView state={stateWith({ farewell: 'replaced' })} onRetry={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Opened somewhere else' })).toBeInTheDocument();
  });

  it('shows a banner only while the socket is down', () => {
    const { rerender, container } = render(<ConnectionBanner state={stateWith()} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ConnectionBanner
        state={stateWith({ connection: { state: 'reconnecting', attempt: 1, retryInMs: 1000 } })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Connection lost');
  });
});

describe('OnlineMenu', () => {
  const props = () => ({
    theme: 'parchment' as const,
    notice: null,
    onQuickplay: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onLeaderboard: vi.fn(),
    onDismissNotice: vi.fn(),
    onBack: vi.fn(),
  });

  it('offers quick play, room creation with a visibility choice, and the leaderboard', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<OnlineMenu {...p} />);
    await user.click(screen.getByRole('button', { name: 'Quick play' }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await user.click(screen.getByRole('radio', { name: 'Public' }));
    await user.click(screen.getByRole('button', { name: 'Create room' }));
    await user.click(screen.getByRole('button', { name: 'Leaderboard' }));
    await user.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(p.onQuickplay).toHaveBeenCalledOnce();
    expect(p.onCreate.mock.calls).toEqual([['private'], ['public']]);
    expect(p.onLeaderboard).toHaveBeenCalled();
    expect(p.onBack).toHaveBeenCalled();
  });

  it('accepts only a five-character code, upper-cases it, and can watch instead of play', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<OnlineMenu {...p} />);
    const join = screen.getByRole('button', { name: 'Join' });
    const watch = screen.getByRole('button', { name: 'Watch' });
    expect(join).toBeDisabled();
    await user.type(screen.getByLabelText('Room code'), 'ab3d');
    expect(join).toBeDisabled();
    await user.type(screen.getByLabelText('Room code'), 'e');
    expect(screen.getByLabelText('Room code')).toHaveValue('AB3DE');
    await user.click(join);
    await user.click(watch);
    expect(p.onJoin.mock.calls).toEqual([
      ['AB3DE', false],
      ['AB3DE', true],
    ]);
  });

  it('submits with Enter and shows a dismissible alert for server notices', async () => {
    const user = userEvent.setup();
    const p = { ...props(), notice: { code: 'room_not_found' as const, message: 'No room has that code.' } };
    render(<OnlineMenu {...p} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No room has that code.');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(p.onDismissNotice).toHaveBeenCalled();
    await user.type(screen.getByLabelText('Room code'), 'ZZZZZ{Enter}');
    expect(p.onJoin).toHaveBeenCalledWith('ZZZZZ', false);
  });
});

describe('LobbyScreen', () => {
  const clock = new ClockSync();
  const handlers = () => ({ onReady: vi.fn(), onTheme: vi.fn(), onLeave: vi.fn() });

  it('lists everyone with their state in words, and marks me and the host', () => {
    render(<LobbyScreen room={ROOM} meId="me" clock={clock} {...handlers()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Room ABCDE');
    const rows = within(screen.getByRole('list', { name: /Players, 2 of 8/ })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Ada (you) · host');
    expect(rows[0]).toHaveTextContent('Not ready');
    expect(rows[1]).toHaveTextContent('Reconnecting...');
    expect(rows[2]).toHaveTextContent('Watching');
    expect(screen.getByText('1 watching')).toBeInTheDocument();
  });

  it('toggles my ready state and leaves', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const { rerender } = render(<LobbyScreen room={ROOM} meId="me" clock={clock} {...h} />);
    const ready = screen.getByRole('button', { name: 'Ready' });
    expect(ready).toHaveAttribute('aria-pressed', 'false');
    await user.click(ready);
    expect(h.onReady).toHaveBeenCalledWith(true);
    const mine = ROOM.players.map((p) => (p.id === 'me' ? { ...p, ready: true } : p));
    rerender(<LobbyScreen room={{ ...ROOM, players: mine }} meId="me" clock={clock} {...h} />);
    await user.click(screen.getByRole('button', { name: 'Not ready' }));
    expect(h.onReady).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(h.onLeave).toHaveBeenCalled();
  });

  it('lets only the host choose the arena', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const { unmount } = render(<LobbyScreen room={ROOM} meId="me" clock={clock} {...h} />);
    await user.click(screen.getByRole('radio', { name: /Tidepool/ }));
    expect(h.onTheme).toHaveBeenCalledWith('tidepool');
    unmount();
    render(<LobbyScreen room={ROOM} meId="bo" clock={clock} {...h} />);
    expect(screen.queryByRole('radio', { name: /Tidepool/ })).toBeNull();
    expect(screen.getByText(/Arena: Kiln/)).toBeInTheDocument();
  });

  it('tells a spectator they will join the next round, and explains public rooms', () => {
    render(<LobbyScreen room={{ ...ROOM, visibility: 'public' }} meId="sp" clock={clock} {...handlers()} />);
    expect(screen.getByText(/join the next round/)).toBeInTheDocument();
    expect(screen.getByText(/anyone using Quick play/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull();
  });

  it('counts down using the server clock', () => {
    vi.useFakeTimers();
    const synced = new ClockSync();
    synced.record(0, 0, 10_000);
    vi.setSystemTime(0);
    const perf = vi.spyOn(performance, 'now');
    perf.mockReturnValue(0);
    render(<CountdownText endsAt={10_000 + 2500} clock={synced} />);
    expect(screen.getByRole('status')).toHaveTextContent('Starting in 3');
    perf.mockReturnValue(1600);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Starting in 1');
    perf.mockRestore();
    vi.useRealTimers();
  });

  it('copies the invite link, or shows it when copying is not allowed', async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    render(<LobbyScreen room={ROOM} meId="me" clock={clock} {...handlers()} />);
    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('?room=ABCDE'));
    expect(await screen.findByText('Invite link copied.')).toBeInTheDocument();
    write.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(await screen.findByText(/Copy this link: .*\?room=ABCDE/)).toBeInTheDocument();
  });
});

describe('LeaderboardPanel', () => {
  const board = (entries: unknown[], persistence = 'memory') => ({
    ok: true,
    json: () => Promise.resolve({ persistence, scope: 'this-server', since: '2026-01-02T00:00:00.000Z', entries }),
  });

  it('shows the standings with an honest scope', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        board([{ rank: 1, nick: 'Ada', wins: 3, matches: 5, bestScore: 210, totalScore: 600 }], 'file'),
      );
    render(<LeaderboardPanel onClose={vi.fn()} fetcher={fetcher} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByText(/not a global ranking/)).toBeInTheDocument();
    expect(screen.getByText(/kept across restarts/)).toBeInTheDocument();
  });

  it('says plainly when nothing has been played, and when memory-only', async () => {
    render(<LeaderboardPanel onClose={vi.fn()} fetcher={vi.fn().mockResolvedValue(board([]))} />);
    expect(await screen.findByText(/No ranked rounds/)).toBeInTheDocument();
    expect(screen.getByText(/resets when the server restarts/)).toBeInTheDocument();
  });

  it('reports failures and lets the player retry', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(board([]));
    render(<LeaderboardPanel onClose={vi.fn()} fetcher={fetcher} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No ranked rounds/)).toBeInTheDocument();
  });
});

describe('Hud network badge and menu invite', () => {
  const hud = {
    phase: 'playing' as const,
    countdown: 0,
    remainingMs: 60_000,
    paused: false,
    result: null,
    snakes: [],
  };

  it('shows ping with bars and a word, and describes it for screen readers', () => {
    render(<Hud hud={{ ...hud, lag: { rtt: 142, jitter: 9, level: 'fair' } }} offline={false} onLeave={vi.fn()} />);
    const badge = screen.getByLabelText(/Network quality Fair, 142 milliseconds/);
    expect(badge).toHaveTextContent('142 ms');
    expect(badge).toHaveTextContent('Fair');
    expect(screen.queryByText(/Offline/)).toBeNull();
  });

  it('shows no network badge for offline practice', () => {
    render(<Hud hud={{ ...hud, lag: null }} offline onLeave={vi.fn()} />);
    expect(screen.queryByLabelText(/Network quality/)).toBeNull();
  });

  it('offers to join an invited room without connecting by itself', async () => {
    const user = userEvent.setup();
    const onJoinInvite = vi.fn();
    render(
      <MenuScreen
        invite="Q7Q7Q"
        onJoinInvite={onJoinInvite}
        onOnline={vi.fn()}
        onPractice={vi.fn()}
        onHelp={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(screen.getByText(/invited to room Q7Q7Q/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join room Q7Q7Q' }));
    expect(onJoinInvite).toHaveBeenCalled();
  });
});
