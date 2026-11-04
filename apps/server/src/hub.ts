import { randomBytes } from 'node:crypto';
import { RECONNECT_GRACE_SECONDS, fallbackNickname, hashSeed, sanitizeNickname, type ClientMsg } from '@snake/shared';
import type { Clock } from './clock';
import { type Connection, send } from './connection';
import type { Logger } from './logger';
import type { Player } from './player';
import type { RoomManager } from './roomManager';
import { TokenBucket } from './security';

type Hello = Extract<ClientMsg, { type: 'hello' }>;

export interface HubDeps {
  clock: Clock;
  log: Logger;
  rooms: RoomManager;
}

const id = (bytes: number): string => randomBytes(bytes).toString('base64url');

/**
 * Who is connected, and which seat each person owns. Identity is a random per-connection player ID plus
 * a secret resume token; the browser's guest ID is only ever used to credit leaderboard results.
 */
export class Hub {
  private readonly players = new Map<string, Player>();
  private readonly byResume = new Map<string, Player>();

  constructor(private readonly deps: HubDeps) {}

  playerCount(): number {
    return this.players.size;
  }

  connectedCount(): number {
    let n = 0;
    for (const player of this.players.values()) if (player.conn) n += 1;
    return n;
  }

  /** Greets a connection. A valid resume token within the grace period hands back the old seat. */
  hello(conn: Connection, msg: Hello): { player: Player; resumed: boolean } {
    const returning = msg.resume ? this.byResume.get(msg.resume) : undefined;
    if (returning) {
      this.takeOver(returning, conn);
      return { player: returning, resumed: true };
    }
    const player = this.create(conn, msg);
    send(conn, {
      type: 'welcome',
      playerId: player.id,
      nick: player.nick,
      resume: player.resume,
      serverTime: this.deps.clock.now(),
      resumed: false,
    });
    return { player, resumed: false };
  }

  /** The socket closed. The seat is kept for the grace period so a flaky connection can come back. */
  disconnect(player: Player, conn: Connection): void {
    if (player.conn !== conn) return;
    player.conn = null;
    player.disconnectedAt = this.deps.clock.now();
    this.deps.log.info('player_disconnected', { player: player.id, room: player.roomCode });
    this.deps.rooms.find(player.roomCode ?? '')?.onDisconnect();
    player.graceTimer?.cancel();
    player.graceTimer = this.deps.clock.after(RECONNECT_GRACE_SECONDS * 1000, () => {
      this.expire(player);
    });
  }

  /** Removes everyone, used when the server shuts down. */
  clear(): void {
    for (const player of this.players.values()) player.graceTimer?.cancel();
    this.players.clear();
    this.byResume.clear();
  }

  private create(conn: Connection, msg: Hello): Player {
    const { clock } = this.deps;
    const player: Player = {
      id: id(9),
      guestId: msg.guestId,
      nick: sanitizeNickname(msg.nick) ?? fallbackNickname(hashSeed(msg.guestId)),
      resume: id(24),
      conn,
      roomCode: null,
      disconnectedAt: null,
      graceTimer: null,
      lastSeq: 0,
      inputBucket: new TokenBucket(40, 40, clock),
      controlBucket: new TokenBucket(10, 20, clock),
    };
    this.players.set(player.id, player);
    this.byResume.set(player.resume, player);
    return player;
  }

  private takeOver(player: Player, conn: Connection): void {
    if (player.conn && player.conn !== conn) {
      send(player.conn, { type: 'bye', reason: 'replaced' });
      player.conn.close(4001, 'replaced by a newer connection');
    }
    player.graceTimer?.cancel();
    player.graceTimer = null;
    player.conn = conn;
    player.disconnectedAt = null;
    send(conn, {
      type: 'welcome',
      playerId: player.id,
      nick: player.nick,
      resume: player.resume,
      serverTime: this.deps.clock.now(),
      resumed: true,
    });
    this.deps.rooms.find(player.roomCode ?? '')?.onReconnect(player);
    this.deps.log.info('player_resumed', { player: player.id, room: player.roomCode });
  }

  private expire(player: Player): void {
    this.deps.rooms.find(player.roomCode ?? '')?.leave(player);
    this.players.delete(player.id);
    this.byResume.delete(player.resume);
    this.deps.log.info('player_expired', { player: player.id });
  }
}
