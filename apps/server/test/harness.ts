import {
  TICK_MS,
  serverMsgSchema,
  type ClientMsg,
  type Dir,
  type ErrorCode,
  type RoomView,
  type ServerMsg,
  type SnapshotMsg,
} from '@snake/shared';
import type { Clock, Timer } from '../src/clock';
import type { Connection } from '../src/connection';
import { Hub } from '../src/hub';
import { Leaderboard } from '../src/leaderboard';
import { silentLogger } from '../src/logger';
import { RoomManager } from '../src/roomManager';
import { Session } from '../src/session';
import { Stats } from '../src/stats';

interface Scheduled {
  at: number;
  seq: number;
  run: () => void;
  cancelled: boolean;
}

/** A clock that only moves when the test says so; timers fire in order as it passes them. */
export class FakeClock implements Clock {
  private time = 1_000_000;
  private seq = 0;
  private timers: Scheduled[] = [];

  now = (): number => this.time;

  after = (ms: number, run: () => void): Timer => {
    const timer: Scheduled = { at: this.time + ms, seq: this.seq++, run, cancelled: false };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    };
  };

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      this.timers = this.timers.filter((t) => !t.cancelled);
      const next = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!next) break;
      this.timers.splice(this.timers.indexOf(next), 1);
      this.time = Math.max(this.time, next.at);
      next.run();
    }
    this.time = end;
  }

  ticks(count: number): void {
    for (let i = 0; i < count; i++) this.advance(TICK_MS);
  }

  pending(): number {
    return this.timers.filter((t) => !t.cancelled).length;
  }
}

/** A connection that records everything the server sends, after checking it against the protocol schema. */
export class FakeConnection implements Connection {
  readonly sent: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;

  constructor(
    readonly id = 'fake',
    readonly ip = '10.0.0.1',
  ) {}

  isOpen(): boolean {
    return this.closed === null;
  }

  sendText(text: string): void {
    this.sent.push(serverMsgSchema.parse(JSON.parse(text)));
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

let guestCounter = 0;

export class TestPlayer {
  conn = new FakeConnection(`c${guestCounter}`);
  session: Session;
  readonly guestId = `guest-${guestCounter++}-abcdef12`;
  private seq = 0;

  constructor(
    private readonly harness: Harness,
    readonly nick: string,
    resume?: string,
  ) {
    this.session = new Session(this.conn, harness.sessionDeps);
    this.send({ type: 'hello', v: 1, nick, guestId: this.guestId, ...(resume ? { resume } : {}) });
  }

  send(msg: ClientMsg): boolean {
    return this.session.handle(msg);
  }

  turn(dir: Dir): number {
    this.seq += 1;
    this.send({ type: 'input', seq: this.seq, dir });
    return this.seq;
  }

  get welcome(): Extract<ServerMsg, { type: 'welcome' }> {
    const msg = this.conn.sent.find((m) => m.type === 'welcome');
    if (msg?.type !== 'welcome') throw new Error('no welcome received');
    return msg;
  }

  get room(): RoomView | null {
    const msgs = this.conn.sent.filter((m): m is Extract<ServerMsg, { type: 'room' }> => m.type === 'room');
    return msgs[msgs.length - 1]?.room ?? null;
  }

  get snapshots(): SnapshotMsg[] {
    return this.conn.sent.filter((m): m is SnapshotMsg => m.type === 'snapshot');
  }

  get errors(): ErrorCode[] {
    return this.conn.sent.flatMap((m) => (m.type === 'error' ? [m.code] : []));
  }

  of<T extends ServerMsg['type']>(type: T): Array<Extract<ServerMsg, { type: T }>> {
    return this.conn.sent.filter((m): m is Extract<ServerMsg, { type: T }> => m.type === type);
  }

  /** Drops the socket the way a network failure would. */
  drop(): void {
    this.conn.closed = { code: 1006, reason: 'lost' };
    this.session.closed();
  }

  /** Reconnects with the resume token this player was given. */
  comeBack(): TestPlayer {
    return new TestPlayer(this.harness, this.nick, this.welcome.resume);
  }

  get id(): string {
    return this.welcome.playerId;
  }
}

export interface HarnessOptions {
  roundTicks?: number;
  maxRooms?: number;
}

export class Harness {
  readonly clock = new FakeClock();
  readonly stats = new Stats(this.clock.now());
  readonly leaderboard = new Leaderboard(this.clock, null, silentLogger);
  readonly rooms: RoomManager;
  readonly hub: Hub;
  readonly sessionDeps;

  constructor(options: HarnessOptions = {}) {
    this.rooms = new RoomManager(
      {
        clock: this.clock,
        log: silentLogger,
        stats: this.stats,
        leaderboard: this.leaderboard,
        roundTicks: options.roundTicks ?? 90,
        random32: () => 12345,
      },
      options.maxRooms ?? 50,
    );
    this.hub = new Hub({ clock: this.clock, log: silentLogger, rooms: this.rooms });
    this.sessionDeps = { hub: this.hub, rooms: this.rooms, clock: this.clock, log: silentLogger, stats: this.stats };
  }

  /** A connection that has not said hello yet. */
  raw(): { conn: FakeConnection; session: Session } {
    const conn = new FakeConnection('raw');
    return { conn, session: new Session(conn, this.sessionDeps) };
  }

  player(nick: string, resume?: string): TestPlayer {
    return new TestPlayer(this, nick, resume);
  }

  /** A host plus `count - 1` joiners in one private room, all ready, ready to start. */
  lobby(count: number): { players: TestPlayer[]; code: string } {
    const players = Array.from({ length: count }, (_, i) => this.player(`P${i + 1}`));
    const [host] = players;
    if (!host) throw new Error('need at least one player');
    host.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    const code = host.room?.code ?? '';
    for (const joiner of players.slice(1)) joiner.send({ type: 'join_room', code });
    return { players, code };
  }

  /** Starts a match: everyone ready, countdown over. */
  startMatch(count = 2): { players: TestPlayer[]; code: string } {
    const lobby = this.lobby(count);
    for (const p of lobby.players) p.send({ type: 'ready', ready: true });
    this.clock.advance(3000);
    return lobby;
  }
}

/** Reads one field of a JSON document without trusting its shape. */
export function jsonField(text: string, key: string): unknown {
  const value: unknown = JSON.parse(text);
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}
