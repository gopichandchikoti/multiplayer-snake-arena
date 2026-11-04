import {
  COUNTDOWN_SECONDS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  SUMMARY_SECONDS,
  type Dir,
  type ErrorCode,
  type RoomView,
  type RoundResult,
  type ServerMsg,
  type ThemeId,
} from '@snake/shared';
import type { Clock, Timer } from './clock';
import { encode, send } from './connection';
import type { Leaderboard } from './leaderboard';
import type { Logger } from './logger';
import { Match } from './match';
import type { Player } from './player';
import type { Stats } from './stats';

export type RoomPhase = RoomView['phase'];
export type JoinOutcome = 'player' | 'spectator' | 'full';

interface Member {
  player: Player;
  role: 'player' | 'spectator';
  slot: number | null;
  ready: boolean;
  /** A spectator who asked to play and is waiting for the next lobby. */
  wantsToPlay: boolean;
}

interface Seat {
  slot: number;
  guestId: string;
  nick: string;
}

export interface RoomDeps {
  clock: Clock;
  log: Logger;
  stats: Stats;
  leaderboard: Leaderboard;
  roundTicks: number;
  random32: () => number;
  /** Called once when the last connected person is gone and the room has been torn down. */
  onEmpty: (room: GameRoom) => void;
}

const EMPTY_ROOM_MS = 60_000;

/** A lobby that turns into a countdown, a match and a summary, and back again. */
export class GameRoom {
  phase: RoomPhase = 'lobby';
  private hostId = '';
  private theme: ThemeId;
  private readonly members = new Map<string, Member>();
  private match: Match | null = null;
  private seats: Seat[] = [];
  private countdownEndsAt: number | null = null;
  private phaseTimer: Timer | null = null;
  private expiry: Timer | null = null;

  constructor(
    readonly code: string,
    readonly visibility: 'private' | 'public',
    theme: ThemeId,
    private readonly deps: RoomDeps,
  ) {
    this.theme = theme;
  }

  playerCount(): number {
    return this.playerMembers().length;
  }

  memberCount(): number {
    return this.members.size;
  }

  isOpenForQuickplay(): boolean {
    return this.visibility === 'public' && this.phase === 'lobby' && this.playerCount() < MAX_PLAYERS;
  }

  join(player: Player, options: { spectate: boolean; ready: boolean }): JoinOutcome {
    const existing = this.members.get(player.id);
    if (existing) return existing.role;
    const outcome = this.admission(options.spectate);
    if (outcome === 'full') return 'full';
    const canPlay = outcome === 'player';
    const slot = canPlay ? this.freeSlot() : null;
    this.members.set(player.id, {
      player,
      role: canPlay ? 'player' : 'spectator',
      slot,
      ready: canPlay && options.ready,
      wantsToPlay: !options.spectate,
    });
    player.roomCode = this.code;
    if (!this.hostId || !this.members.has(this.hostId)) this.hostId = player.id;
    this.expiry?.cancel();
    this.broadcastView();
    this.reviewCountdown();
    return outcome;
  }

  /** Players are only seated in the lobby; at any other time (or by choice) a newcomer watches. */
  private admission(spectate: boolean): JoinOutcome {
    if (this.phase === 'lobby' && !spectate) return this.playerCount() < MAX_PLAYERS ? 'player' : 'full';
    return this.spectatorCount() < MAX_SPECTATORS ? 'spectator' : 'full';
  }

  leave(player: Player): void {
    const member = this.members.get(player.id);
    if (!member) return;
    if (this.phase === 'playing' && member.role === 'player' && member.slot !== null) this.match?.forfeit(member.slot);
    this.members.delete(player.id);
    player.roomCode = null;
    if (this.hostId === player.id) this.hostId = this.nextHost();
    this.afterMembershipChange();
  }

  setReady(player: Player, ready: boolean): ErrorCode | null {
    const member = this.members.get(player.id);
    if (!member || member.role !== 'player') return 'not_in_room';
    if (this.phase !== 'lobby' && this.phase !== 'countdown') return 'wrong_phase';
    member.ready = ready;
    this.broadcastView();
    this.reviewCountdown();
    return null;
  }

  setTheme(player: Player, theme: ThemeId): ErrorCode | null {
    if (!this.members.has(player.id)) return 'not_in_room';
    if (player.id !== this.hostId) return 'not_host';
    if (this.phase !== 'lobby') return 'wrong_phase';
    this.theme = theme;
    this.broadcastView();
    return null;
  }

  handleInput(player: Player, seq: number, dir: Dir): void {
    const member = this.members.get(player.id);
    if (!member || member.role !== 'player' || member.slot === null || this.phase !== 'playing' || !this.match) return;
    if (seq <= player.lastSeq) {
      this.deps.stats.counters.inputsDuplicate += 1;
      return;
    }
    player.lastSeq = seq;
    this.deps.stats.counters.inputsAccepted += 1;
    this.match.input(member.slot, seq, dir);
  }

  onDisconnect(): void {
    this.afterMembershipChange();
  }

  /** A returning player gets the room as it is right now, plus the live board if a match is running. */
  onReconnect(player: Player): void {
    this.expiry?.cancel();
    this.broadcastView();
    if (this.phase === 'playing' && this.match) send(player.conn, this.match.snapshotMessage());
  }

  view(): RoomView {
    const members = [...this.members.values()].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    return {
      code: this.code,
      phase: this.phase,
      visibility: this.visibility,
      theme: this.theme,
      hostId: this.hostId,
      players: members.map((m) => ({
        id: m.player.id,
        nick: m.player.nick,
        slot: m.slot,
        ready: m.ready,
        connected: m.player.conn !== null,
        role: m.role,
      })),
      countdownEndsAt: this.countdownEndsAt,
      matchStartedAt: this.match ? this.match.startedAt : null,
      maxPlayers: MAX_PLAYERS,
    };
  }

  destroy(): void {
    this.phaseTimer?.cancel();
    this.expiry?.cancel();
    this.match?.stop();
    for (const member of this.members.values()) member.player.roomCode = null;
    this.members.clear();
  }

  private playerMembers(): Member[] {
    return [...this.members.values()].filter((m) => m.role === 'player');
  }

  private spectatorCount(): number {
    return this.members.size - this.playerCount();
  }

  private freeSlot(): number {
    const taken = new Set(this.playerMembers().map((m) => m.slot));
    for (let slot = 0; slot < MAX_PLAYERS; slot++) if (!taken.has(slot)) return slot;
    throw new Error('no free slot');
  }

  private nextHost(): string {
    const connected = [...this.members.values()].find((m) => m.player.conn !== null);
    return (connected ?? [...this.members.values()][0])?.player.id ?? '';
  }

  private afterMembershipChange(): void {
    if (this.members.size === 0) {
      this.destroy();
      this.deps.onEmpty(this);
      return;
    }
    this.broadcastView();
    this.reviewCountdown();
    const anyoneConnected = [...this.members.values()].some((m) => m.player.conn !== null);
    if (!anyoneConnected) {
      this.expiry?.cancel();
      this.expiry = this.deps.clock.after(EMPTY_ROOM_MS, () => {
        this.deps.log.info('room_expired', { room: this.code });
        this.destroy();
        this.deps.onEmpty(this);
      });
    }
  }

  /** Starts the countdown once every seated player is ready and connected; cancels it when that stops being true. */
  private reviewCountdown(): void {
    const players = this.playerMembers();
    const ready = players.length >= MIN_PLAYERS && players.every((m) => m.ready && m.player.conn !== null);
    if (this.phase === 'lobby' && ready) this.beginCountdown();
    else if (this.phase === 'countdown' && !ready) this.cancelCountdown();
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.countdownEndsAt = this.deps.clock.now() + COUNTDOWN_SECONDS * 1000;
    this.phaseTimer = this.deps.clock.after(COUNTDOWN_SECONDS * 1000, () => {
      this.startMatch();
    });
    this.broadcastView();
  }

  private cancelCountdown(): void {
    this.phaseTimer?.cancel();
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.broadcastView();
  }

  private startMatch(): void {
    const seated = this.playerMembers().filter((m): m is Member & { slot: number } => m.slot !== null);
    this.seats = seated.map((m) => ({ slot: m.slot, guestId: m.player.guestId, nick: m.player.nick }));
    for (const member of seated) member.player.lastSeq = 0;
    this.match = new Match(
      {
        clock: this.deps.clock,
        log: this.deps.log.child({ room: this.code }),
        stats: this.deps.stats,
        slots: this.seats.map((s) => s.slot),
        seed: this.deps.random32(),
        roundTicks: this.deps.roundTicks,
        broadcast: (msg) => {
          this.broadcast(msg);
        },
      },
      (result) => {
        this.finishMatch(result);
      },
    );
    this.phase = 'playing';
    this.countdownEndsAt = null;
    this.deps.stats.counters.matchesPlayed += 1;
    this.deps.log.info('match_start', { room: this.code, players: this.seats.length });
    this.match.start();
    this.broadcastView();
  }

  private finishMatch(result: RoundResult): void {
    const names: Record<string, string> = {};
    for (const seat of this.seats) names[String(seat.slot)] = seat.nick;
    this.deps.leaderboard.record(
      result.standings.flatMap((standing) => {
        const seat = this.seats.find((s) => s.slot === standing.slot);
        return seat
          ? [{ guestId: seat.guestId, nick: seat.nick, score: standing.score, won: standing.rank === 1 }]
          : [];
      }),
    );
    this.phase = 'summary';
    this.broadcast({ type: 'round_end', ...result, names, ranked: this.seats.length >= MIN_PLAYERS });
    this.broadcastView();
    this.deps.log.info('match_end', { room: this.code, reason: result.reason });
    this.phaseTimer = this.deps.clock.after(SUMMARY_SECONDS * 1000, () => {
      this.backToLobby();
    });
  }

  private backToLobby(): void {
    this.match = null;
    this.phase = 'lobby';
    for (const member of this.members.values()) member.ready = false;
    for (const member of this.members.values()) {
      if (member.role === 'spectator' && member.wantsToPlay && this.playerCount() < MAX_PLAYERS) {
        member.role = 'player';
        member.slot = this.freeSlot();
      }
    }
    this.broadcastView();
  }

  private broadcastView(): void {
    this.broadcast({ type: 'room', room: this.view() });
  }

  private broadcast(msg: ServerMsg): void {
    const text = encode(msg);
    for (const member of this.members.values()) {
      const conn = member.player.conn;
      if (conn?.isOpen()) conn.sendText(text);
    }
  }
}
