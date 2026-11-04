import { END_GRACE_MS, TICK_MS, type RoundResult, type ServerMsg } from '@snake/shared';
import { describe, expect, it, vi } from 'vitest';
import { type Clock, type Timer, systemClock } from '../src/clock';
import { createLogger, silentLogger } from '../src/logger';
import { Match } from '../src/match';
import { Stats } from '../src/stats';

/** A clock whose time can jump forward while timers wait, like a process that was paused. */
class JumpClock implements Clock {
  time = 5000;
  private due: Array<{ at: number; run: () => void; cancelled: boolean }> = [];

  now = (): number => this.time;

  after = (ms: number, run: () => void): Timer => {
    const entry = { at: this.time + ms, run, cancelled: false };
    this.due.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  };

  /** Moves time to `to` and then fires whatever was due, once. */
  jumpTo(to: number): void {
    this.time = to;
    const ready = this.due.filter((d) => d.at <= to && !d.cancelled);
    this.due = this.due.filter((d) => d.at > to && !d.cancelled);
    for (const d of ready) d.run();
  }
}

function build(clock: Clock, log = silentLogger) {
  const sent: ServerMsg[] = [];
  const finished: RoundResult[] = [];
  const stats = new Stats(clock.now());
  const match = new Match(
    {
      clock,
      log,
      stats,
      slots: [0, 1],
      seed: 7,
      roundTicks: 30,
      broadcast: (msg) => sent.push(msg),
    },
    (result) => finished.push(result),
  );
  return { match, sent, finished, stats };
}

const snapshotsOf = (sent: ServerMsg[]) => sent.flatMap((m) => (m.type === 'snapshot' ? [m] : []));
const snapshotTicks = (sent: ServerMsg[]): number[] => snapshotsOf(sent).map((m) => m.tick);

describe('Match timing', () => {
  it('runs due ticks in order and records how late each one was', () => {
    const clock = new JumpClock();
    const { match, sent, stats } = build(clock);
    match.start();
    clock.jumpTo(clock.time + TICK_MS * 3 + 1);
    expect(snapshotTicks(sent)).toEqual([0, 1, 2, 3]);
    expect(stats.counters.ticks).toBe(3);
    expect(stats.tickLag().max).toBeGreaterThan(0);
  });

  it('after a long stall, catches up a few ticks then carries on from now instead of racing', () => {
    const lines: string[] = [];
    const clock = new JumpClock();
    const { match, sent } = build(clock, createLogger({ level: 'warn', sink: (l) => lines.push(l) }));
    match.start();
    const start = match.startedAt;
    clock.jumpTo(clock.time + TICK_MS * 20);
    expect(snapshotTicks(sent)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lines[0]).toContain('tick_clock_reanchored');
    const lastTime = snapshotsOf(sent).at(-1)?.time ?? 0;
    expect(lastTime).toBeLessThan(start + TICK_MS * 20);
    clock.jumpTo(clock.time + TICK_MS + 1);
    expect(snapshotTicks(sent).at(-1)).toBe(6);
    expect(match.startedAt).toBeGreaterThan(start);
  });

  it('can be stopped and then does nothing more', () => {
    const clock = new JumpClock();
    const { match, sent } = build(clock);
    match.start();
    match.stop();
    expect(match.finished).toBe(true);
    clock.jumpTo(clock.time + 10_000);
    expect(snapshotTicks(sent)).toEqual([0]);
    match.forfeit(0);
    expect(snapshotTicks(sent)).toEqual([0]);
  });

  it('describes the current board for a reconnecting client without consuming events', () => {
    const clock = new JumpClock();
    const { match } = build(clock);
    match.start();
    const message = match.snapshotMessage();
    expect(message).toMatchObject({ type: 'snapshot', tick: 0, events: [] });
  });

  it('announces a forfeit that ends the round, then reports the result after the grace pause', () => {
    const clock = new JumpClock();
    const { match, sent, finished } = build(clock);
    match.start();
    match.forfeit(1);
    expect(sent.at(-1)).toMatchObject({
      type: 'snapshot',
      events: [{ type: 'die', cause: 'forfeit' }, { type: 'bonus' }],
    });
    expect(finished).toHaveLength(0);
    clock.jumpTo(clock.time + END_GRACE_MS);
    expect(finished[0]).toMatchObject({ reason: 'last-standing', winnerSlots: [0] });
  });

  it('applies and acknowledges input, reporting what the simulation did with it', () => {
    const clock = new JumpClock();
    const { match } = build(clock);
    match.start();
    expect(match.input(0, 4, 2)).toBe('accepted');
    expect(match.input(0, 5, 2)).toBe('ignored');
    expect(match.input(0, 6, 3)).toBe('accepted');
    expect(match.input(0, 7, 0)).toBe('rejected');
    expect(match.snapshotMessage()).toMatchObject({ ack: { '0': 7 } });
  });
});

describe('systemClock', () => {
  it('reads real time and fires and cancels real timers', async () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(50);
    const fired = vi.fn();
    const cancelled = vi.fn();
    systemClock.after(5, fired);
    systemClock.after(5, cancelled).cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
  });
});
