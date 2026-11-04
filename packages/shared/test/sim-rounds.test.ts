import { describe, expect, it } from 'vitest';
import { SCORE, applyInput, createWorld, drainEvents, endRound, forfeitSnake, getSnake, stepWorld } from '../src';
import { must, place, quietWorld, stepTimes } from './helpers';

describe('round end', () => {
  it('ends when the timer runs out and ranks by score', () => {
    const world = quietWorld([0, 1]);
    world.endsAtTick = 5;
    for (const s of world.snakes) s.countdown = 100_000;
    must(getSnake(world, 1)).score = 30;
    stepTimes(world, 5);
    expect(world.result?.reason).toBe('timer');
    expect(world.result?.endedAtTick).toBe(5);
    expect(world.result?.winnerSlots).toEqual([1]);
    expect(world.result?.standings.map((s) => [s.slot, s.rank])).toEqual([
      [1, 1],
      [0, 2],
    ]);
  });

  it('declares a draw when score, length and kills are all equal', () => {
    const world = quietWorld([0, 1]);
    world.endsAtTick = 2;
    for (const s of world.snakes) s.countdown = 100_000;
    stepTimes(world, 2);
    expect(world.result?.winnerSlots).toEqual([0, 1]);
    expect(world.result?.standings.map((s) => s.rank)).toEqual([1, 1]);
  });

  it('breaks a score tie by length, then kills', () => {
    const world = quietWorld([0, 1]);
    world.endsAtTick = 2;
    for (const s of world.snakes) s.countdown = 100_000;
    place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
        [6, 10],
      ],
      1,
    ).countdown = 100_000;
    stepTimes(world, 2);
    expect(world.result?.winnerSlots).toEqual([0]);

    const second = quietWorld([0, 1]);
    second.endsAtTick = 2;
    for (const s of second.snakes) s.countdown = 100_000;
    must(getSnake(second, 1)).kills = 1;
    stepTimes(second, 2);
    expect(second.result?.winnerSlots).toEqual([1]);
  });

  it('gives the last snake standing a bonus and ends the round on the spot', () => {
    const world = quietWorld([0, 1]);
    place(
      world,
      0,
      [
        [38, 10],
        [37, 10],
        [36, 10],
        [35, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [10, 20],
        [9, 20],
        [8, 20],
        [7, 20],
      ],
      1,
    ).countdown = 100_000;
    stepTimes(world, 3);
    expect(world.result?.reason).toBe('last-standing');
    expect(world.result?.winnerSlots).toEqual([1]);
    expect(must(getSnake(world, 1)).score).toBe(SCORE.lastStanding);
    expect(drainEvents(world)).toContainEqual({ type: 'bonus', slot: 1, points: SCORE.lastStanding });
  });

  it('does not award the bonus when everyone is eliminated together', () => {
    const world = quietWorld([0, 1]);
    place(
      world,
      0,
      [
        [9, 10],
        [8, 10],
        [7, 10],
        [6, 10],
      ],
      1,
    );
    place(
      world,
      1,
      [
        [11, 10],
        [12, 10],
        [13, 10],
        [14, 10],
      ],
      3,
    );
    stepTimes(world, 1);
    expect(world.result?.reason).toBe('all-eliminated');
    expect(world.snakes.every((s) => s.score === 0)).toBe(true);
    expect(world.result?.standings.every((s) => !s.alive)).toBe(true);
  });

  it('freezes the world once the round has a result', () => {
    const world = quietWorld([0, 1]);
    endRound(world, 'ended-early');
    const before = JSON.stringify(world);
    stepWorld(world);
    endRound(world, 'timer');
    expect(JSON.stringify(world)).toBe(before);
    expect(world.result?.reason).toBe('ended-early');
  });

  it('keeps a single-snake sandbox going until the timer', () => {
    const world = quietWorld([0]);
    world.endsAtTick = 3;
    must(getSnake(world, 0)).countdown = 100_000;
    stepTimes(world, 2);
    expect(world.result).toBeNull();
    stepTimes(world, 1);
    expect(world.result?.reason).toBe('timer');
  });
});

describe('forfeits', () => {
  it('removes the snake without crediting anyone and can end the round', () => {
    const world = quietWorld([0, 1]);
    forfeitSnake(world, 0);
    const events = drainEvents(world);
    expect(events.find((e) => e.type === 'die')).toMatchObject({ slot: 0, cause: 'forfeit', by: null });
    expect(world.result?.reason).toBe('last-standing');
    expect(world.snakes.every((s) => s.kills === 0)).toBe(true);
  });

  it('ignores a snake that is already dead or unknown', () => {
    const world = quietWorld([0, 1, 2]);
    forfeitSnake(world, 0);
    drainEvents(world);
    forfeitSnake(world, 0);
    forfeitSnake(world, 7);
    expect(drainEvents(world)).toHaveLength(0);
    expect(world.result).toBeNull();
  });
});

describe('determinism', () => {
  /** A fixed input script: every 7th tick one seat is told to turn right or down. */
  const script = (world: ReturnType<typeof createWorld>, ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      if (t % 7 === 0) applyInput(world, t % 3, (t / 7) % 2 === 0 ? 1 : 2);
      stepWorld(world);
    }
  };

  it('replays the same seed and inputs to the identical world', () => {
    const a = createWorld({ seed: 1234, slots: [0, 1, 2] });
    const b = createWorld({ seed: 1234, slots: [0, 1, 2] });
    script(a, 400);
    script(b, 400);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('diverges when the seed differs', () => {
    const a = createWorld({ seed: 1, slots: [0, 1, 2] });
    const b = createWorld({ seed: 2, slots: [0, 1, 2] });
    script(a, 200);
    script(b, 200);
    expect(JSON.stringify(a.foods)).not.toBe(JSON.stringify(b.foods));
  });
});
