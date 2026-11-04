# Game rules and balance

All numbers live in `packages/shared/src/constants.ts` and are used by the server, the client and offline practice, so
they cannot disagree.

## Board and time

- Arena: **40 x 28** cells, solid walls. Eight start positions in four 180-degree-rotated pairs, so no seat is favoured.
- The server steps the world **15 times per second** (66.7 ms per tick). A snake normally moves **every 2nd tick**
  (7.5 cells per second); with Surge it moves every tick (15 cells per second).
- Round: **120 seconds**, 3 second countdown, a 1.2 second pause on the deciding crash, then the summary.
- 2 to 8 players per room. Up to 16 spectators.

## Movement and input

- Turns are queued, at most **two** per move. Repeating the current heading is ignored and reversing straight into the
  neck is rejected, so a fast "down, left" works but "left" while heading right does not.
- A client sends only _intent_ (`dir`, `seq`). It never sends positions, scores or collision results.

## Crashes

Every move of a tick is judged against one picture of where everybody will be afterwards, so the result never depends
on the order snakes are processed in.

| Situation                                     | Result                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Head leaves the arena                         | That snake crashes.                                                                                |
| Head enters any body cell, including its own  | That snake crashes; the owner of the body gets the elimination if it survives the tick.            |
| A tail that is moving away                    | The cell counts as free (you may follow a snake closely). A growing or standing-still tail blocks. |
| Two heads reach the same cell, or swap cells  | Both crash; nobody scores.                                                                         |
| Head runs into a snake that is standing still | The mover crashes; the parked snake is credited.                                                   |

A crashed snake leaves a pellet on every third segment (at most 8).

## Scoring

| Event                                | Points | Growth |
| ------------------------------------ | ------ | ------ |
| Apple                                | 10     | +1     |
| Golden apple (1 in 8 spawns)         | 30     | +3     |
| Pellet from a crashed snake          | 5      | +1     |
| Another snake crashes into your body | 40     | none   |
| Last snake standing                  | 60     | none   |

The round ends when one snake is left (that snake gets the 60 point bonus), when everyone has crashed, or when the timer
runs out. **Most points wins.** Ties are broken by length, then by crashes caused; a full tie is a shared win.

## Power-ups

At most two lie on the board. One may appear every 10 seconds (first at 8 s), at least two cells away from walls, and
vanishes after 15 seconds. Spawn weights: Surge 3, Aegis 2, Trim 2. Each has its own _shape_ as well as colour, and a
ring around it counts down its remaining time.

| Power-up | Effect                                                                           | Balance reasoning                                                                          |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Surge    | Double speed for 5 s.                                                            | Hard to steer at 15 cells/s, so it is a risk as well as a reward.                          |
| Aegis    | Absorbs one crash within 12 s. The snake then stands still for 5 ticks (0.33 s). | The stumble is long enough to steer away but short enough to be punished by a nearby head. |
| Trim     | Cuts the body to half (not below 4).                                             | Score is separate from length, so it costs nothing; useful to escape a self-trap.          |

## Online-only rules

- Players who have not marked themselves ready are not started with. All players ready (at least 2) starts a 3 second
  countdown. Quick play joins players as ready.
- Late joiners watch as spectators and join the next round's lobby.
- A disconnected player's snake keeps its heading for a **15 second grace period**; reconnecting with the same session
  token takes control back. After that the snake is removed (forfeit).
- Only rounds with at least two connected human players count towards the leaderboard. Bots exist only in offline
  practice.
