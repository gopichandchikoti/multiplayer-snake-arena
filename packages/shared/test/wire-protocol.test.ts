import { describe, expect, it } from 'vitest';
import {
  clientMsgSchema,
  createWorld,
  fallbackNickname,
  sanitizeNickname,
  serverMsgSchema,
  snakeToWire,
  snapshotFromWorld,
  snapshotSchema,
  stepWorld,
  viewFromSnapshot,
  wireToSnake,
} from '../src';
import { must, place, quietWorld } from './helpers';

describe('snapshot wire format', () => {
  it('round-trips a living snake and a dead one', () => {
    const world = quietWorld([0, 1]);
    const alive = place(
      world,
      0,
      [
        [10, 10],
        [9, 10],
        [8, 10],
        [7, 10],
      ],
      1,
    );
    alive.queue = [2];
    alive.score = 70;
    const dead = must(world.snakes[1]);
    dead.alive = false;
    dead.body = [];
    expect(wireToSnake(snakeToWire(alive))).toMatchObject({
      slot: 0,
      alive: true,
      body: alive.body,
      queue: [2],
      score: 70,
    });
    expect(wireToSnake(snakeToWire(dead))).toMatchObject({ slot: 1, alive: false, body: [] });
  });

  it('builds a snapshot that passes its own schema and decodes back to the same world', () => {
    const world = createWorld({ seed: 9, slots: [0, 1, 2] });
    for (let i = 0; i < 30; i++) stepWorld(world);
    const msg = snapshotFromWorld(world, 1234, new Map([[0, 17]]), []);
    const parsed = snapshotSchema.parse(JSON.parse(JSON.stringify(msg)));
    const view = must(viewFromSnapshot(parsed));
    expect(view.tick).toBe(30);
    expect(view.ack.get(0)).toBe(17);
    expect(view.snakes.map((s) => s.body)).toEqual(world.snakes.map((s) => s.body));
    expect(view.foods).toEqual(world.foods);
  });

  it('is small: eight long snakes stay well under 4 kB', () => {
    const world = createWorld({ seed: 1, slots: [0, 1, 2, 3, 4, 5, 6, 7] });
    for (const s of world.snakes) s.body = Array.from({ length: 38 }, (_, i) => ({ x: 2 + i, y: 2 + s.slot * 3 }));
    const json = JSON.stringify(snapshotFromWorld(world, 1, new Map(), []));
    expect(json.length).toBeLessThan(4096);
  });

  it('rejects a snapshot whose snake path leaves the arena', () => {
    const world = quietWorld([0, 1]);
    const msg = snapshotFromWorld(world, 1, new Map(), []);
    const first = must(msg.snakes[0]);
    const origin: [number, number] = [0, 0];
    const broken = { ...msg, snakes: [{ ...first, h: origin, p: '3' }] };
    expect(viewFromSnapshot(broken)).toBeNull();
  });
});

describe('message validation', () => {
  const ok = [
    { type: 'hello', v: 1, nick: 'Ada', guestId: 'abcd1234-ef56' },
    { type: 'hello', v: 1, nick: 'Ada', guestId: 'abcd1234-ef56', resume: 'A'.repeat(22) },
    { type: 'quickplay' },
    { type: 'create_room', visibility: 'private', theme: 'kiln' },
    { type: 'join_room', code: 'ABCDE', spectate: true },
    { type: 'ready', ready: true },
    { type: 'set_theme', theme: 'tidepool' },
    { type: 'leave_room' },
    { type: 'input', seq: 5, dir: 3 },
    { type: 'ping', t: 12.5 },
  ];
  it.each(ok)('accepts %j', (msg) => {
    expect(clientMsgSchema.safeParse(msg).success).toBe(true);
  });

  const bad = [
    { type: 'input', seq: 0, dir: 1 },
    { type: 'input', seq: 1.5, dir: 1 },
    { type: 'input', seq: 1, dir: 4 },
    { type: 'input', seq: 1, dir: 1, x: 5, y: 5 },
    { type: 'input', seq: 1, dir: 1, score: 9999 },
    { type: 'hello', v: 2, nick: 'Ada', guestId: 'abcd1234-ef56' },
    { type: 'hello', v: 1, nick: 'x'.repeat(200), guestId: 'abcd1234-ef56' },
    { type: 'hello', v: 1, nick: 'Ada', guestId: '<script>' },
    { type: 'join_room', code: 'ABC' },
    { type: 'create_room', visibility: 'secret', theme: 'kiln' },
    { type: 'ready', ready: 'yes' },
    { type: 'ping', t: Infinity },
    { type: 'teleport' },
    { dir: 1 },
    'input',
    null,
  ];
  it.each(bad)('rejects %j', (msg) => {
    expect(clientMsgSchema.safeParse(msg).success).toBe(false);
  });

  it('validates server messages too', () => {
    expect(serverMsgSchema.safeParse({ type: 'pong', t: 1, st: 2 }).success).toBe(true);
    expect(serverMsgSchema.safeParse({ type: 'error', code: 'room_full', message: 'Full' }).success).toBe(true);
    expect(serverMsgSchema.safeParse({ type: 'error', code: 'nope', message: 'x' }).success).toBe(false);
    expect(serverMsgSchema.safeParse({ type: 'room', room: null }).success).toBe(true);
    expect(serverMsgSchema.safeParse({ type: 'bye', reason: 'idle' }).success).toBe(true);
    expect(serverMsgSchema.safeParse({ type: 'bye', reason: 'because' }).success).toBe(false);
  });
});

describe('nicknames', () => {
  it('keeps ordinary names and tidies whitespace', () => {
    expect(sanitizeNickname('Ada')).toBe('Ada');
    expect(sanitizeNickname('  Mary   Ann ')).toBe('Mary Ann');
    expect(sanitizeNickname("Zoë O'Neil-Smith")).toBe("Zoë O'Neil-Smith");
    expect(sanitizeNickname('Dr. Ada')).toBe('Dr. Ada');
    expect(sanitizeNickname('ｆｕｌｌｗｉｄｔｈ')).toBe('fullwidth');
    expect(sanitizeNickname('तारा')).toBe('तारा');
  });

  it('strips markup, control characters, bidi overrides and emoji', () => {
    const at = (code: number) => String.fromCodePoint(code);
    expect(sanitizeNickname('<b>Eve</b>')).toBe('bEveb');
    expect(sanitizeNickname(`A${at(0x202e)}bc${at(0)}d`)).toBe('A bc d');
    expect(sanitizeNickname(`Zed${at(0x200b)}${at(0x200b)}man`)).toBe('Zed man');
    expect(sanitizeNickname('Sam 🐍🐍')).toBe('Sam');
    const stacked = sanitizeNickname(`Z${at(0x301).repeat(12)}ed`) ?? '';
    expect(stacked.normalize('NFD')).toBe(`Z${at(0x301).repeat(3)}ed`);
  });

  it('rejects names that are too short, too long, reserved or not text', () => {
    for (const bad of ['', 'a', '🐍🐍', 'x'.repeat(17), 'Admin', ' SERVER ', 42, null, undefined, {}]) {
      expect(sanitizeNickname(bad)).toBeNull();
    }
    expect(sanitizeNickname('x'.repeat(16))).toBe('x'.repeat(16));
  });

  it('invents a readable fallback', () => {
    expect(fallbackNickname(1234567)).toMatch(/^Guest \d{4}$/);
  });
});
