import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, snapshotFromWorld, type RoomView, type ServerMsg } from '@snake/shared';
import { GameSocket } from '../src/net/gameSocket';
import { OnlineSession } from '../src/net/onlineSession';
import { settingsStore } from '../src/state/app';
import { defaultSettings } from '../src/state/settings';
import { OnlineScreen } from '../src/ui/online/OnlineScreen';
import { FakeSocket } from './fakeSocket';

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
  ],
  countdownEndsAt: null,
  matchStartedAt: null,
  maxPlayers: 8,
};

describe('OnlineScreen end to end with a fake socket', () => {
  function boot() {
    const sockets: FakeSocket[] = [];
    const socket = new GameSocket({
      url: 'ws://t/ws',
      nick: () => 'Ada',
      guestId: 'guest-12345678',
      factory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      now: () => 1000,
      random: () => 1,
    });
    const session = new OnlineSession(socket);
    session.connect();
    const raw = sockets[0];
    raw?.open();
    const say = (msg: ServerMsg): void => {
      act(() => {
        raw?.say(msg);
      });
    };
    return { session, say, raw, onExit: vi.fn() };
  }
  const welcome: ServerMsg = {
    type: 'welcome',
    playerId: 'me',
    nick: 'Ada',
    resume: 'R'.repeat(32),
    serverTime: 1,
    resumed: false,
  };

  it('walks connecting, menu, lobby, match and summary', async () => {
    const user = userEvent.setup();
    const { session, say, raw, onExit } = boot();
    render(<OnlineScreen session={session} onExit={onExit} />);
    expect(screen.getByRole('heading', { name: 'Connecting' })).toBeInTheDocument();
    say(welcome);
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quick play' }));
    expect(raw?.sent.at(-1)).toEqual({ type: 'quickplay' });
    say({ type: 'room', room: ROOM });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Room ABCDE');
    await user.click(screen.getByRole('button', { name: 'Ready' }));
    expect(raw?.sent.at(-1)).toEqual({ type: 'ready', ready: true });
    await user.click(screen.getByRole('radio', { name: /Tidepool/ }));
    expect(raw?.sent.at(-1)).toEqual({ type: 'set_theme', theme: 'tidepool' });

    say({ type: 'room', room: { ...ROOM, phase: 'countdown', countdownEndsAt: 99_999 } });
    expect(screen.getByText(/Starting in/)).toBeInTheDocument();
    const world = createWorld({ seed: 1, slots: [0, 1] });
    say(snapshotFromWorld(world, 5000, new Map(), []));
    say({ type: 'room', room: { ...ROOM, phase: 'playing' } });
    expect(screen.getByTestId('arena-canvas')).toBeInTheDocument();

    say({
      type: 'round_end',
      reason: 'last-standing',
      endedAtTick: 40,
      winnerSlots: [0],
      standings: [
        { slot: 0, rank: 1, score: 100, kills: 1, length: 6, alive: true },
        { slot: 1, rank: 2, score: 10, kills: 0, length: 4, alive: false },
      ],
      names: { '0': 'Ada', '1': 'Bo' },
      ranked: true,
    });
    say({ type: 'room', room: { ...ROOM, phase: 'summary' } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You win!');
    expect(screen.getByText(/Back to the lobby in a few seconds/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(raw?.sent.at(-1)).toEqual({ type: 'leave_room' });
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('keeps the seat on screen with a banner while the connection is down', () => {
    const { session, say, raw } = boot();
    render(<OnlineScreen session={session} onExit={vi.fn()} />);
    say(welcome);
    say({ type: 'room', room: ROOM });
    act(() => {
      raw?.drop(1006);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Room ABCDE');
    expect(screen.getAllByRole('status').some((el) => /Connection lost/.test(el.textContent))).toBe(true);
  });

  it('opens the leaderboard from the online menu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            persistence: 'memory',
            scope: 'this-server',
            since: '2026-01-01T00:00:00Z',
            entries: [],
          }),
      }),
    );
    const { session, say } = boot();
    render(<OnlineScreen session={session} onExit={vi.fn()} />);
    say(welcome);
    await user.click(screen.getByRole('button', { name: 'Leaderboard' }));
    expect(await screen.findByText(/No ranked rounds/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.unstubAllGlobals();
  });
});
