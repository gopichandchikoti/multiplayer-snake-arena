/** Tunable game numbers. docs/GAME_RULES.md explains the reasoning behind each one. */
export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 15;
export const TICK_MS = 1000 / TICK_RATE;

export const GRID_W = 40;
export const GRID_H = 28;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 16;

export const ROUND_SECONDS = 120;
export const ROUND_TICKS = ROUND_SECONDS * TICK_RATE;
export const COUNTDOWN_SECONDS = 3;
/** Pause between the deciding event and the summary so the final crash can be seen. */
export const END_GRACE_MS = 1200;
export const SUMMARY_SECONDS = 12;

export const START_LENGTH = 4;
/** Ticks between moves: 2 ticks = 7.5 cells per second, 1 tick (surge) = 15 cells per second. */
export const MOVE_EVERY = 2;
export const MOVE_EVERY_SURGE = 1;
export const MAX_QUEUED_TURNS = 2;

export const SURGE_TICKS = 5 * TICK_RATE;
export const AEGIS_TICKS = 12 * TICK_RATE;
/** A snake whose shield absorbed a crash stands still this long, which is time to steer away. */
export const AEGIS_STUMBLE_TICKS = 5;
export const TRIM_KEEP_RATIO = 0.5;

export const SCORE = { apple: 10, golden: 30, pellet: 5, elimination: 40, lastStanding: 60 } as const;
export const GROWTH = { apple: 1, golden: 3, pellet: 1 } as const;

export const FOOD_MIN = 4;
export const FOOD_PER_PLAYER = 2;
export const GOLDEN_ONE_IN = 8;
export const PELLET_EVERY_NTH_SEGMENT = 3;
export const PELLET_CAP = 8;

export const POWERUP_FIRST_TICK = 8 * TICK_RATE;
export const POWERUP_INTERVAL_TICKS = 10 * TICK_RATE;
export const POWERUP_LIFETIME_TICKS = 15 * TICK_RATE;
export const POWERUP_MAX_ON_BOARD = 2;
export const POWERUP_MARGIN = 2;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Seconds a dropped player keeps their seat (and snake) before the server gives it up. */
export const RECONNECT_GRACE_SECONDS = 15;
