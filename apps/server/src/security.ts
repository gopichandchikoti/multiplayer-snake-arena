import type { Clock } from './clock';

interface OriginPolicy {
  allowedOrigins: readonly string[];
  allowNoOrigin: boolean;
  production: boolean;
}

/**
 * Decides whether a browser page may open a game socket. Browsers always send an Origin on WebSocket
 * handshakes, so this is what stops another website from driving a visitor's connection (CSWSH).
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined, policy: OriginPolicy): boolean {
  if (origin === undefined) return policy.allowNoOrigin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (policy.allowedOrigins.length > 0) return policy.allowedOrigins.includes(parsed.origin);
  if (parsed.host === host) return true;
  return !policy.production && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

/** Refills at `perSecond` up to `burst`; `take` says whether one more action is allowed right now. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    private readonly clock: Clock,
  ) {
    this.tokens = burst;
    this.last = clock.now();
  }

  take(cost = 1): boolean {
    const now = this.clock.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Caps simultaneous sockets per client address. */
export class IpLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly max: number) {}

  acquire(ip: string): boolean {
    const current = this.counts.get(ip) ?? 0;
    if (current >= this.max) return false;
    this.counts.set(ip, current + 1);
    return true;
  }

  release(ip: string): void {
    const current = this.counts.get(ip) ?? 0;
    if (current <= 1) this.counts.delete(ip);
    else this.counts.set(ip, current - 1);
  }

  total(): number {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }
}
