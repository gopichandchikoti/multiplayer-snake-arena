import { z } from 'zod';
import { NICKNAME_MAX, PROTOCOL_VERSION, ROOM_CODE_LENGTH } from './constants';
import type { GameEvent } from './types';

/** Messages are validated with strict schemas on both ends: unknown keys and wrong types are rejected. */
const dirSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const themeSchema = z.enum(['parchment', 'kiln', 'tidepool']);
const cellCoord = z.number().int().min(0).max(255);

export const clientMsgSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('hello'),
    v: z.literal(PROTOCOL_VERSION),
    nick: z.string().max(NICKNAME_MAX * 4),
    guestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    resume: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/)
      .optional(),
  }),
  z.strictObject({ type: z.literal('quickplay') }),
  z.strictObject({ type: z.literal('create_room'), visibility: z.enum(['private', 'public']), theme: themeSchema }),
  z.strictObject({
    type: z.literal('join_room'),
    code: z.string().length(ROOM_CODE_LENGTH),
    spectate: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal('ready'), ready: z.boolean() }),
  z.strictObject({ type: z.literal('set_theme'), theme: themeSchema }),
  z.strictObject({ type: z.literal('leave_room') }),
  z.strictObject({ type: z.literal('input'), seq: z.number().int().min(1).max(2147483647), dir: dirSchema }),
  z.strictObject({ type: z.literal('ping'), t: z.number() }),
]);
export type ClientMsg = z.infer<typeof clientMsgSchema>;

export const ERROR_CODES = [
  'bad_message',
  'bad_nickname',
  'unsupported_version',
  'rate_limited',
  'room_not_found',
  'room_full',
  'not_in_room',
  'already_in_room',
  'not_host',
  'wrong_phase',
  'session_expired',
  'server_busy',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const roomPlayerSchema = z.strictObject({
  id: z.string(),
  nick: z.string(),
  slot: z.number().int().min(0).max(7).nullable(),
  ready: z.boolean(),
  connected: z.boolean(),
  role: z.enum(['player', 'spectator']),
});

export const roomViewSchema = z.strictObject({
  code: z.string(),
  phase: z.enum(['lobby', 'countdown', 'playing', 'summary']),
  visibility: z.enum(['private', 'public']),
  theme: themeSchema,
  hostId: z.string(),
  players: z.array(roomPlayerSchema),
  countdownEndsAt: z.number().nullable(),
  matchStartedAt: z.number().nullable(),
  maxPlayers: z.number().int(),
});
export type RoomView = z.infer<typeof roomViewSchema>;
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;

const snakeWireSchema = z.strictObject({
  s: z.number().int().min(0).max(7),
  a: z.union([z.literal(0), z.literal(1)]),
  d: dirSchema,
  q: z.array(dirSchema).max(4),
  h: z.tuple([cellCoord, cellCoord]),
  p: z.string().max(2048),
  g: z.number().int().min(0),
  c: z.number().int().min(-1000).max(1000),
  sc: z.number().int(),
  k: z.number().int().min(0),
  sg: z.number().int().min(0),
  ag: z.number().int().min(0),
});
export type SnakeWire = z.infer<typeof snakeWireSchema>;

const foodSchema = z.strictObject({
  id: z.number().int(),
  kind: z.enum(['apple', 'golden', 'pellet']),
  x: cellCoord,
  y: cellCoord,
});
const powerUpSchema = z.strictObject({
  id: z.number().int(),
  kind: z.enum(['surge', 'aegis', 'trim']),
  x: cellCoord,
  y: cellCoord,
  expiresAt: z.number().int(),
});

const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('eat'),
    slot: z.number().int(),
    kind: z.enum(['apple', 'golden', 'pellet']),
    x: cellCoord,
    y: cellCoord,
    points: z.number().int(),
  }),
  z.strictObject({
    type: z.literal('power'),
    slot: z.number().int(),
    kind: z.enum(['surge', 'aegis', 'trim']),
    x: cellCoord,
    y: cellCoord,
  }),
  z.strictObject({ type: z.literal('shield-break'), slot: z.number().int(), x: cellCoord, y: cellCoord }),
  z.strictObject({
    type: z.literal('die'),
    slot: z.number().int(),
    cause: z.enum(['wall', 'body', 'head-on', 'forfeit']),
    by: z.number().int().nullable(),
    x: cellCoord,
    y: cellCoord,
    path: z.string().max(2048),
  }),
  z.strictObject({ type: z.literal('bonus'), slot: z.number().int(), points: z.number().int() }),
  z.strictObject({
    type: z.literal('spawn-power'),
    kind: z.enum(['surge', 'aegis', 'trim']),
    x: cellCoord,
    y: cellCoord,
  }),
]) satisfies z.ZodType<GameEvent>;

export const snapshotSchema = z.strictObject({
  type: z.literal('snapshot'),
  tick: z.number().int().min(0),
  time: z.number(),
  ends: z.number().int(),
  snakes: z.array(snakeWireSchema).max(8),
  foods: z.array(foodSchema).max(256),
  powerUps: z.array(powerUpSchema).max(16),
  ack: z.record(z.string(), z.number().int()),
  events: z.array(eventSchema).max(64),
});
export type SnapshotMsg = z.infer<typeof snapshotSchema>;

const standingSchema = z.strictObject({
  slot: z.number().int(),
  rank: z.number().int(),
  score: z.number().int(),
  kills: z.number().int(),
  length: z.number().int(),
  alive: z.boolean(),
});

export const roundEndSchema = z.strictObject({
  type: z.literal('round_end'),
  reason: z.enum(['timer', 'last-standing', 'all-eliminated', 'ended-early']),
  endedAtTick: z.number().int(),
  winnerSlots: z.array(z.number().int()),
  standings: z.array(standingSchema),
  names: z.record(z.string(), z.string()),
  ranked: z.boolean(),
});
export type RoundEndMsg = z.infer<typeof roundEndSchema>;

export const serverMsgSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('welcome'),
    playerId: z.string(),
    resume: z.string(),
    serverTime: z.number(),
    resumed: z.boolean(),
  }),
  z.strictObject({ type: z.literal('error'), code: z.enum(ERROR_CODES), message: z.string().max(200) }),
  z.strictObject({ type: z.literal('room'), room: roomViewSchema.nullable() }),
  snapshotSchema,
  roundEndSchema,
  z.strictObject({ type: z.literal('pong'), t: z.number(), st: z.number() }),
  z.strictObject({ type: z.literal('bye'), reason: z.enum(['server_shutdown', 'replaced', 'idle', 'kicked']) }),
]);
export type ServerMsg = z.infer<typeof serverMsgSchema>;
