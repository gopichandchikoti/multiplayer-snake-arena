import type { ErrorCode, RoomView, RoundEndMsg, ServerMsg, ThemeId } from '@snake/shared';
import { createStore, type Store } from '../state/store';
import type { GameSocket, SocketStatus } from './gameSocket';
import { OnlineGame } from './onlineGame';

export interface Notice {
  code: ErrorCode;
  message: string;
}

export type FarewellReason = 'replaced' | 'server_shutdown' | 'kicked' | 'idle';

export interface SessionState {
  connection: SocketStatus;
  me: { id: string; nick: string } | null;
  room: RoomView | null;
  /** The running match, present from the first snapshot until the room returns to the lobby. */
  game: OnlineGame | null;
  /** Result of the round that just ended, shown on the summary until the lobby reopens. */
  result: RoundEndMsg | null;
  notice: Notice | null;
  farewell: FarewellReason | null;
}

/**
 * Everything the player is doing online: connection, room, match. It turns server messages into one
 * observable state for the UI, and turns UI actions into protocol messages. Actions never pretend to
 * succeed: if the socket is down they leave a notice instead.
 */
export class OnlineSession {
  readonly state: Store<SessionState>;
  private readonly unsubscribers: Array<() => void> = [];

  private autoJoin: string | null;

  constructor(
    readonly socket: GameSocket,
    options: { autoJoin?: string } = {},
  ) {
    this.autoJoin = options.autoJoin ?? null;
    this.state = createStore<SessionState>({
      connection: socket.status.get(),
      me: null,
      room: null,
      game: null,
      result: null,
      notice: null,
      farewell: null,
    });
    this.unsubscribers.push(
      socket.status.subscribe(() => {
        this.state.update((s) => ({ ...s, connection: socket.status.get() }));
      }),
      socket.onMessage((msg) => {
        this.handle(msg);
      }),
    );
  }

  connect(): void {
    this.socket.connect();
  }

  quickplay(): void {
    this.act({ type: 'quickplay' });
  }

  createRoom(visibility: 'private' | 'public', theme: ThemeId): void {
    this.act({ type: 'create_room', visibility, theme });
  }

  joinRoom(code: string, spectate = false): void {
    this.act({ type: 'join_room', code: code.trim().toUpperCase(), spectate });
  }

  setReady(ready: boolean): void {
    this.act({ type: 'ready', ready });
  }

  setTheme(theme: ThemeId): void {
    this.act({ type: 'set_theme', theme });
  }

  /** Leaves the room. The UI returns to the online menu straight away; the server confirms with a null room. */
  leave(): void {
    this.act({ type: 'leave_room' });
    this.dropMatch();
    this.state.update((s) => ({ ...s, room: null, result: null }));
  }

  clearNotice(): void {
    this.state.update((s) => ({ ...s, notice: null }));
  }

  dispose(): void {
    for (const off of this.unsubscribers.splice(0)) off();
    this.dropMatch();
    this.socket.close();
  }

  private act(msg: Parameters<GameSocket['send']>[0]): void {
    if (this.socket.send(msg)) return;
    this.state.update((s) => ({
      ...s,
      notice: { code: 'server_busy', message: 'You are offline. Check your connection and try again.' },
    }));
  }

  private handle(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.onWelcome(msg);
        break;
      case 'room':
        this.onRoom(msg.room);
        break;
      case 'snapshot':
        this.onSnapshot(msg);
        break;
      case 'round_end':
        this.state.get().game?.onRoundEnd(msg);
        this.state.update((s) => ({ ...s, result: msg }));
        break;
      case 'error':
        this.state.update((s) => ({ ...s, notice: { code: msg.code, message: msg.message } }));
        break;
      case 'bye':
        this.state.update((s) => ({ ...s, farewell: msg.reason }));
        break;
      case 'pong':
        break;
    }
  }

  private onWelcome(msg: Extract<ServerMsg, { type: 'welcome' }>): void {
    this.state.update((s) => ({ ...s, me: { id: msg.playerId, nick: msg.nick }, farewell: null }));
    if (msg.resumed) this.state.get().game?.onReconnected();
    this.joinInvited(msg.resumed);
  }

  private onSnapshot(msg: Extract<ServerMsg, { type: 'snapshot' }>): void {
    // A snapshot that outlives our room (we just left) belongs to a match we are no longer part of.
    if (this.state.get().room) this.ensureGame().onSnapshot(msg);
  }

  /** An invite link (?room=CODE) joins its room once, right after the first greeting. */
  private joinInvited(resumed: boolean): void {
    if (this.autoJoin && !resumed) this.joinRoom(this.autoJoin);
    this.autoJoin = null;
  }

  private onRoom(room: RoomView | null): void {
    if (!room || room.phase === 'lobby' || room.phase === 'countdown') this.dropMatch();
    this.state.update((s) => ({ ...s, room, result: room && room.phase === 'summary' ? s.result : null }));
  }

  private ensureGame(): OnlineGame {
    const existing = this.state.get().game;
    if (existing) return existing;
    const game = new OnlineGame({
      send: (msg) => this.socket.send(msg),
      clock: this.socket.clock,
      room: () => this.state.get().room,
      playerId: () => this.state.get().me?.id ?? null,
    });
    this.state.update((s) => ({ ...s, game, result: null }));
    return game;
  }

  private dropMatch(): void {
    const game = this.state.get().game;
    if (!game) return;
    game.dispose();
    this.state.update((s) => ({ ...s, game: null }));
  }
}
