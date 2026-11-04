import { describe, expect, it } from 'vitest';
import { SCORE, drainEvents, getSnake } from '../src';
import type { Dir, WorldState } from '../src';
import { type Cells, deathOf, duel, headOf, must, place, quietWorld, stepTimes } from './helpers';

describe('collisions', () => {
  it('kills a snake that leaves the arena', () => {
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
    stepTimes(world, 1);
    expect(headOf(must(getSnake(world, 0)))).toEqual([39, 10]);
    stepTimes(world, 2);
    expect(must(getSnake(world, 0)).alive).toBe(false);
    expect(deathOf(drainEvents(world), 0)).toMatchObject({ cause: 'wall', by: null, x: 39, y: 10 });
  });

  it('kills a snake that runs into its own body and gives nobody a point', () => {
    const world = duel(
      [
        [
          [5, 5],
          [5, 6],
          [6, 6],
          [6, 5],
          [6, 4],
        ],
        1,
      ],
      [
        [
          [20, 20],
          [19, 20],
          [18, 20],
          [17, 20],
        ],
        1,
      ],
    );
    must(getSnake(world, 1)).countdown = 100_000;
    stepTimes(world, 1);
    expect(deathOf(drainEvents(world), 0)).toMatchObject({ cause: 'body', by: null });
    expect(world.snakes.every((s) => s.kills === 0)).toBe(true);
  });

  it('credits the owner of the body that was hit', () => {
    const world = duel(
      [
        [
          [9, 9],
          [8, 9],
          [7, 9],
          [6, 9],
        ],
        1,
      ],
      [
        [
          [10, 8],
          [10, 9],
          [10, 10],
          [10, 11],
        ],
        0,
      ],
    );
    stepTimes(world, 1);
    const events = drainEvents(world);
    expect(deathOf(events, 0)).toMatchObject({ cause: 'body', by: 1 });
    const winner = must(getSnake(world, 1));
    expect(winner.score).toBe(SCORE.elimination);
    expect(winner.kills).toBe(1);
    expect(winner.alive).toBe(true);
  });

  it('kills both snakes in a head-on crash without crediting either', () => {
    const world = duel(
      [
        [
          [9, 10],
          [8, 10],
          [7, 10],
          [6, 10],
        ],
        1,
      ],
      [
        [
          [11, 10],
          [12, 10],
          [13, 10],
          [14, 10],
        ],
        3,
      ],
    );
    stepTimes(world, 1);
    const events = drainEvents(world);
    expect(deathOf(events, 0)).toMatchObject({ cause: 'head-on', by: null });
    expect(deathOf(events, 1)).toMatchObject({ cause: 'head-on', by: null });
    expect(world.snakes.map((s) => s.kills)).toEqual([0, 0, 0]);
  });

  it('treats two heads swapping cells as a crash for both', () => {
    const world = duel(
      [
        [
          [10, 10],
          [9, 10],
          [8, 10],
          [7, 10],
        ],
        1,
      ],
      [
        [
          [11, 10],
          [12, 10],
          [13, 10],
          [14, 10],
        ],
        3,
      ],
    );
    stepTimes(world, 1);
    expect(must(getSnake(world, 0)).alive).toBe(false);
    expect(must(getSnake(world, 1)).alive).toBe(false);
    expect(world.snakes.map((s) => s.kills)).toEqual([0, 0, 0]);
  });

  it('gives the same outcome whatever order the snakes are stored in', () => {
    const scenarios: Array<[[Cells, Dir], [Cells, Dir]]> = [
      [
        [
          [
            [9, 9],
            [8, 9],
            [7, 9],
            [6, 9],
          ],
          1,
        ],
        [
          [
            [10, 8],
            [10, 9],
            [10, 10],
            [10, 11],
          ],
          0,
        ],
      ],
      [
        [
          [
            [9, 10],
            [8, 10],
            [7, 10],
            [6, 10],
          ],
          1,
        ],
        [
          [
            [11, 10],
            [12, 10],
            [13, 10],
            [14, 10],
          ],
          3,
        ],
      ],
      [
        [
          [
            [10, 10],
            [9, 10],
            [8, 10],
            [7, 10],
          ],
          1,
        ],
        [
          [
            [11, 10],
            [12, 10],
            [13, 10],
            [14, 10],
          ],
          3,
        ],
      ],
    ];
    for (const [a, b] of scenarios) {
      const summary = (reverse: boolean) => {
        const world = duel(a, b, reverse);
        stepTimes(world, 1);
        return world.snakes.map((s) => [s.slot, s.alive, s.score, s.kills] as const).sort((x, y) => x[0] - y[0]);
      };
      expect(summary(true)).toEqual(summary(false));
    }
  });

  it('lets a head enter the cell a moving tail is leaving, but not a staying one', () => {
    const base = (tweak: (w: WorldState) => void) => {
      const world = duel(
        [
          [
            [9, 5],
            [8, 5],
            [7, 5],
            [6, 5],
          ],
          1,
        ],
        [
          [
            [10, 2],
            [10, 3],
            [10, 4],
            [10, 5],
          ],
          0,
        ],
      );
      tweak(world);
      stepTimes(world, 1);
      return must(getSnake(world, 0)).alive;
    };
    expect(base(() => undefined)).toBe(true);
    expect(
      base((w) => {
        must(getSnake(w, 1)).grow = 1;
      }),
    ).toBe(false);
    expect(
      base((w) => {
        must(getSnake(w, 1)).countdown = 100_000;
      }),
    ).toBe(false);
  });

  it('hitting a parked snake head is a body hit that credits the parked snake', () => {
    const world = duel(
      [
        [
          [9, 10],
          [8, 10],
          [7, 10],
          [6, 10],
        ],
        1,
      ],
      [
        [
          [10, 10],
          [11, 10],
          [12, 10],
          [13, 10],
        ],
        3,
      ],
    );
    must(getSnake(world, 1)).countdown = 100_000;
    stepTimes(world, 1);
    expect(deathOf(drainEvents(world), 0)).toMatchObject({ cause: 'body', by: 1 });
    expect(must(getSnake(world, 1)).kills).toBe(1);
  });
});
