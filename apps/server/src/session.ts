import type { ClientMsg, ErrorCode } from '@snake/shared';
import type { Clock } from './clock';
import { type Connection, send } from './connection';
import type { Hub } from './hub';
import type { Logger } from './logger';
import type { Player } from './player';
import type { GameRoom } from './room';
import type { RoomManager } from './roomManager';
import type { Stats } from './stats';

export interface SessionDeps {
  hub: Hub;
  rooms: RoomManager;
  clock: Clock;
  log: Logger;
  stats: Stats;
}

const MESSAGES: Readonly<Record<ErrorCode, string>> = {
  bad_message: 'That message was not understood.',
  bad_nickname: 'That name cannot be used.',
  unsupported_version: 'This client is out of date. Reload the page.',
  rate_limited: 'Slow down: too many requests.',
  room_not_found: 'No room has that code.',
  room_full: 'That room is full.',
  not_in_room: 'You are not in a room.',
  already_in_room: 'You are already in a room.',
  not_host: 'Only the host can do that.',
  wrong_phase: 'That is not possible right now.',
  session_expired: 'Your session expired.',
  server_busy: 'The server is busy. Try again shortly.',
};

/** Handles the validated messages of one connection and turns them into room actions. */
export class Session {
  private player: Player | null = null;

  constructor(
    readonly conn: Connection,
    private readonly deps: SessionDeps,
  ) {}

  get hasPlayer(): boolean {
    return this.player !== null;
  }

  fail(code: ErrorCode): void {
    send(this.conn, { type: 'error', code, message: MESSAGES[code] });
  }

  /** Returns false when the message was dropped because this player is sending too much. */
  handle(msg: ClientMsg): boolean {
    if (msg.type === 'hello') return this.onHello(msg);
    const player = this.player;
    if (!player) {
      this.fail('bad_message');
      return false;
    }
    const bucket = msg.type === 'input' ? player.inputBucket : player.controlBucket;
    if (!bucket.take()) {
      this.deps.stats.counters.rateLimited += 1;
      if (msg.type !== 'input') this.fail('rate_limited');
      return false;
    }
    this.dispatch(player, msg);
    return true;
  }

  closed(): void {
    if (this.player) this.deps.hub.disconnect(this.player, this.conn);
  }

  private onHello(msg: Extract<ClientMsg, { type: 'hello' }>): boolean {
    if (this.player) {
      this.fail('bad_message');
      return false;
    }
    this.player = this.deps.hub.hello(this.conn, msg).player;
    return true;
  }

  private dispatch(player: Player, msg: Exclude<ClientMsg, { type: 'hello' }>): void {
    switch (msg.type) {
      case 'ping':
        send(this.conn, { type: 'pong', t: msg.t, st: this.deps.clock.now() });
        break;
      case 'quickplay':
        this.quickplay(player);
        break;
      case 'create_room':
        this.createRoom(player, msg.visibility, msg.theme);
        break;
      case 'join_room':
        this.joinRoom(player, msg.code, msg.spectate ?? false);
        break;
      default:
        this.inRoom(player, msg);
    }
  }

  private createRoom(player: Player, visibility: 'private' | 'public', theme: 'parchment' | 'kiln' | 'tidepool'): void {
    if (player.roomCode) return this.fail('already_in_room');
    const room = this.deps.rooms.create(visibility, theme);
    if (!room) return this.fail('server_busy');
    room.join(player, { spectate: false, ready: false });
  }

  private joinRoom(player: Player, code: string, spectate: boolean): void {
    if (player.roomCode) return this.fail('already_in_room');
    const room = this.deps.rooms.find(code);
    if (!room) return this.fail('room_not_found');
    if (room.join(player, { spectate, ready: false }) === 'full') this.fail('room_full');
  }

  private quickplay(player: Player): void {
    if (player.roomCode) return this.fail('already_in_room');
    const room = this.deps.rooms.quickplayCandidate() ?? this.deps.rooms.create('public', 'parchment');
    if (!room) return this.fail('server_busy');
    room.join(player, { spectate: false, ready: true });
  }

  private inRoom(
    player: Player,
    msg: Extract<ClientMsg, { type: 'ready' | 'set_theme' | 'leave_room' | 'input' }>,
  ): void {
    const room: GameRoom | undefined = this.deps.rooms.find(player.roomCode ?? '');
    if (!room) return this.fail('not_in_room');
    let error: ErrorCode | null = null;
    if (msg.type === 'ready') error = room.setReady(player, msg.ready);
    else if (msg.type === 'set_theme') error = room.setTheme(player, msg.theme);
    else if (msg.type === 'leave_room') room.leave(player);
    else room.handleInput(player, msg.seq, msg.dir);
    if (error) this.fail(error);
  }
}
