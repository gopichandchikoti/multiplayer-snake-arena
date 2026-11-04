/** mulberry32: tiny seeded generator whose whole state is one 32-bit integer, so worlds can be replayed. */
export function nextFloat(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

export class Rng {
  constructor(public state: number) {}

  float(): number {
    const r = nextFloat(this.state);
    this.state = r.state;
    return r.value;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive);
  }
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
