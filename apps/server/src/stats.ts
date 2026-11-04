export interface Counters {
  connectionsOpened: number;
  connectionsClosed: number;
  connectionsRejected: number;
  messagesIn: number;
  badMessages: number;
  rateLimited: number;
  inputsAccepted: number;
  inputsDuplicate: number;
  ticks: number;
  matchesPlayed: number;
}

export interface TickLag {
  samples: number;
  p50: number;
  p99: number;
  max: number;
}

const WINDOW = 512;

/** Cheap in-process counters and a rolling window of how late ticks fire, for /api/stats and load tests. */
export class Stats {
  readonly counters: Counters = {
    connectionsOpened: 0,
    connectionsClosed: 0,
    connectionsRejected: 0,
    messagesIn: 0,
    badMessages: 0,
    rateLimited: 0,
    inputsAccepted: 0,
    inputsDuplicate: 0,
    ticks: 0,
    matchesPlayed: 0,
  };
  private readonly lags: number[] = [];
  private next = 0;

  constructor(readonly startedAt: number) {}

  recordTickLag(ms: number): void {
    this.counters.ticks += 1;
    this.lags[this.next] = Math.max(0, ms);
    this.next = (this.next + 1) % WINDOW;
  }

  tickLag(): TickLag {
    const sorted = [...this.lags].sort((a, b) => a - b);
    const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return { samples: sorted.length, p50: at(0.5), p99: at(0.99), max: sorted[sorted.length - 1] ?? 0 };
  }
}
