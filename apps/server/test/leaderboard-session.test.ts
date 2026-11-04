import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Leaderboard } from '../src/leaderboard';
import { createLogger, silentLogger } from '../src/logger';
import { FakeClock, Harness, jsonField } from './harness';

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'coilyard-lb-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const result = (guestId: string, nick: string, score: number, won: boolean) => ({ guestId, nick, score, won });

describe('Leaderboard', () => {
  it('ranks by wins, then total score, and hides guest IDs', () => {
    const board = new Leaderboard(new FakeClock(), null, silentLogger);
    board.record([result('g-aaaaaaaa', 'Ada', 120, true), result('g-bbbbbbbb', 'Bo', 80, false)]);
    board.record([result('g-aaaaaaaa', 'Ada', 50, false), result('g-bbbbbbbb', 'Bo', 200, true)]);
    board.record([result('g-bbbbbbbb', 'Bob', 10, false)]);
    const top = board.top(10);
    expect(top).toMatchObject({ persistence: 'memory', scope: 'this-server' });
    expect(top.entries).toEqual([
      { rank: 1, nick: 'Bob', wins: 1, matches: 3, bestScore: 200, totalScore: 290 },
      { rank: 2, nick: 'Ada', wins: 1, matches: 2, bestScore: 120, totalScore: 170 },
    ]);
    expect(JSON.stringify(top)).not.toContain('g-aaaaaaaa');
    expect(board.top(1).entries).toHaveLength(1);
  });

  it('says when it is only in memory and since when', () => {
    const clock = new FakeClock();
    const board = new Leaderboard(clock, null, silentLogger);
    expect(board.top(5)).toMatchObject({
      persistence: 'memory',
      entries: [],
      since: new Date(clock.now()).toISOString(),
    });
  });

  it('survives a restart when a file is configured', async () => {
    const file = join(dir, 'nested', 'board.json');
    const first = new Leaderboard(new FakeClock(), file, silentLogger);
    first.record([result('g-aaaaaaaa', 'Ada', 70, true)]);
    await first.flush();
    expect(jsonField(await readFile(file, 'utf8'), 'entries')).toHaveLength(1);
    const second = new Leaderboard(new FakeClock(), file, silentLogger);
    await second.load();
    expect(second.top(5)).toMatchObject({ persistence: 'file', entries: [{ nick: 'Ada', wins: 1, bestScore: 70 }] });
  });

  it('starts empty when the file does not exist yet', async () => {
    const board = new Leaderboard(new FakeClock(), join(dir, 'none.json'), silentLogger);
    await board.load();
    expect(board.top(5).entries).toEqual([]);
  });

  it('sets a corrupt file aside instead of overwriting it', async () => {
    const file = join(dir, 'board.json');
    await writeFile(file, '{ this is not json');
    const lines: string[] = [];
    const clock = new FakeClock();
    const board = new Leaderboard(clock, file, createLogger({ level: 'warn', sink: (l) => lines.push(l) }));
    await board.load();
    expect(board.top(5).entries).toEqual([]);
    expect((await readdir(dir)).some((name) => name.startsWith('board.json.corrupt-'))).toBe(true);
    expect(lines[0]).toContain('leaderboard_file_corrupt');
    await writeFile(file, JSON.stringify({ since: 'x', entries: [{ nick: 1 }] }));
    clock.advance(5);
    await board.load();
    expect((await readdir(dir)).filter((name) => name.includes('corrupt')).length).toBe(2);
  });

  it('reports a failed save without throwing', async () => {
    const lines: string[] = [];
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'a file where a folder is needed');
    const board = new Leaderboard(
      new FakeClock(),
      join(blocker, 'board.json'),
      createLogger({ level: 'error', sink: (l) => lines.push(l) }),
    );
    board.record([result('g-aaaaaaaa', 'Ada', 1, true)]);
    await board.flush();
    expect(lines[0]).toContain('leaderboard_save_failed');
  });

  it('keeps at most 5000 players, forgetting the least recently active', () => {
    const clock = new FakeClock();
    const board = new Leaderboard(clock, null, silentLogger);
    for (let i = 0; i < 5002; i++) {
      clock.advance(1);
      board.record([result(`guest-${String(i).padStart(6, '0')}`, `P${i}`, i, false)]);
    }
    const nicks = board.top(6000).entries.map((e) => e.nick);
    expect(nicks).toHaveLength(5000);
    expect(nicks).not.toContain('P0');
    expect(nicks).toContain('P5001');
  });

  it('rethrows read errors other than "missing"', async () => {
    const board = new Leaderboard(new FakeClock(), dir, silentLogger);
    await expect(board.load()).rejects.toThrow();
  });
});

describe('Session', () => {
  it('names players with a cleaned nickname, or a guest name when nothing usable is left', () => {
    const h = new Harness();
    expect(h.player('<b>Eve</b>').welcome.nick).toBe('bEveb');
    expect(h.player('🐍').welcome.nick).toMatch(/^Guest \d{4}$/);
    expect(h.player('Admin').welcome.nick).toMatch(/^Guest \d{4}$/);
  });

  it('never leaks the resume token of one player to another', () => {
    const h = new Harness();
    const a = h.player('A');
    const b = h.player('B');
    expect(JSON.stringify(b.conn.sent)).not.toContain(a.welcome.resume);
    expect(a.welcome.resume).toHaveLength(32);
  });

  it('answers pings with the server time so clients can synchronise', () => {
    const h = new Harness();
    const p = h.player('A');
    p.send({ type: 'ping', t: 123.5 });
    expect(p.of('pong')[0]).toEqual({ type: 'pong', t: 123.5, st: h.clock.now() });
  });

  it('refuses everything before hello, and a second hello', () => {
    const h = new Harness();
    const { conn, session } = h.raw();
    expect(session.handle({ type: 'quickplay' })).toBe(false);
    expect(conn.sent).toHaveLength(1);
    expect(conn.sent[0]).toMatchObject({ type: 'error', code: 'bad_message' });
    expect(session.hasPlayer).toBe(false);
    const p = h.player('A');
    expect(p.send({ type: 'hello', v: 1, nick: 'A', guestId: 'abcdefgh-1' })).toBe(false);
    expect(p.errors).toEqual(['bad_message']);
  });

  it('throttles chatty control messages but only drops floods of inputs quietly', () => {
    const h = new Harness();
    const p = h.player('A');
    const accepted = Array.from({ length: 40 }, () => p.send({ type: 'ping', t: 1 })).filter(Boolean).length;
    expect(accepted).toBe(20);
    expect(p.errors.filter((e) => e === 'rate_limited').length).toBe(20);
    const q = h.player('B');
    q.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    const before = q.errors.length;
    const sent = Array.from({ length: 100 }, (_, i) => q.send({ type: 'input', seq: i + 1, dir: 1 })).filter(
      Boolean,
    ).length;
    expect(sent).toBe(40);
    expect(q.errors.length).toBe(before);
    expect(h.stats.counters.rateLimited).toBe(80);
  });
});
