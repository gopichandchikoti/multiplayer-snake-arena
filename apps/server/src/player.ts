import type { Connection } from './connection';
import type { Timer } from './clock';
import type { TokenBucket } from './security';

export interface Player {
  readonly id: string;
  readonly guestId: string;
  nick: string;
  /** Secret that lets this player take their seat back after a dropped connection. Never logged. */
  readonly resume: string;
  conn: Connection | null;
  roomCode: string | null;
  disconnectedAt: number | null;
  graceTimer: Timer | null;
  /** Highest input sequence number accepted so far; anything not higher is a duplicate or a replay. */
  lastSeq: number;
  readonly inputBucket: TokenBucket;
  readonly controlBucket: TokenBucket;
}
