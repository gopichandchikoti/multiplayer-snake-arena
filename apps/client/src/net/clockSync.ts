export type LagLevel = 'good' | 'fair' | 'poor' | 'bad';

export interface LagInfo {
  rtt: number;
  jitter: number;
  level: LagLevel;
}

interface Sample {
  rtt: number;
  /** serverTime - clientTime at the same instant. */
  offset: number;
}

const KEEP = 8;
const MAX_RTT_MS = 10_000;

export function lagLevel(rtt: number): LagLevel {
  if (rtt < 80) return 'good';
  if (rtt < 160) return 'fair';
  if (rtt < 300) return 'poor';
  return 'bad';
}

/**
 * Estimates the server's clock from ping round trips (Cristian's algorithm). Of the recent samples the
 * one with the smallest round trip is trusted, because a quick exchange leaves the least room for
 * asymmetric delay. Round-trip time and jitter are smoothed so the indicator does not flicker.
 */
export class ClockSync {
  private samples: Sample[] = [];
  private smoothedRtt: number | null = null;
  private smoothedJitter = 0;

  /** `sentAt` and `receivedAt` are client times; `serverTime` is what the server stamped on its reply. */
  record(sentAt: number, receivedAt: number, serverTime: number): void {
    const rtt = receivedAt - sentAt;
    if (!Number.isFinite(rtt) || !Number.isFinite(serverTime) || rtt < 0 || rtt > MAX_RTT_MS) return;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - receivedAt });
    if (this.samples.length > KEEP) this.samples.shift();
    if (this.smoothedRtt === null) {
      this.smoothedRtt = rtt;
      return;
    }
    this.smoothedJitter = 0.8 * this.smoothedJitter + 0.2 * Math.abs(rtt - this.smoothedRtt);
    this.smoothedRtt = 0.8 * this.smoothedRtt + 0.2 * rtt;
  }

  get ready(): boolean {
    return this.samples.length > 0;
  }

  get rtt(): number {
    return this.smoothedRtt ?? 0;
  }

  get jitter(): number {
    return this.smoothedJitter;
  }

  get offset(): number {
    let best: Sample | null = null;
    for (const sample of this.samples) if (!best || sample.rtt < best.rtt) best = sample;
    return best?.offset ?? 0;
  }

  serverNow(clientNow: number): number {
    return clientNow + this.offset;
  }

  /** The client time at which a server timestamp happens. */
  clientTime(serverTime: number): number {
    return serverTime - this.offset;
  }

  info(): LagInfo | null {
    return this.ready
      ? { rtt: Math.round(this.rtt), jitter: Math.round(this.jitter), level: lagLevel(this.rtt) }
      : null;
  }

  reset(): void {
    this.samples = [];
    this.smoothedRtt = null;
    this.smoothedJitter = 0;
  }
}
