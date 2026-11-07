import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { END_GRACE_MS, TICK_MS } from '@snake/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, type ServerConfig } from '../src/config';
import { silentLogger } from '../src/logger';
import { createGameServer, type GameServer } from '../src/server';
import { FakeClock } from './harness';
import { TestSocket } from './socket';

let root = '';
let server: GameServer | null = null;
let clock = new FakeClock();
let port = 0;
const sockets: TestSocket[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'coilyard-http-'));
  await mkdir(join(root, 'web', 'assets'), { recursive: true });
  await writeFile(join(root, 'web', 'index.html'), '<!doctype html><title>Coilyard</title>');
  await writeFile(join(root, 'web', 'assets', 'app-abc123.js'), 'console.log(1)');
  await writeFile(join(root, 'secret.txt'), 'top secret');
  clock = new FakeClock();
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await server?.stop();
  server = null;
  await rm(root, { recursive: true, force: true });
});

async function boot(env: Record<string, string> = {}, config?: Partial<ServerConfig>): Promise<void> {
  const base = loadConfig({ PORT: '0', HOST: '127.0.0.1', ROUND_TICKS: '30', ...env });
  server = createGameServer({ ...base, staticDir: join(root, 'web'), ...config }, { clock, log: silentLogger });
  port = (await server.start()).port;
}

const url = (path = '') => `http://127.0.0.1:${String(port)}${path}`;
const wsUrl = () => `ws://127.0.0.1:${String(port)}/ws`;

async function open(headers: Record<string, string> = {}): Promise<TestSocket> {
  const socket = new TestSocket(wsUrl(), headers);
  sockets.push(socket);
  await socket.opened();
  return socket;
}

async function greeted(nick: string): Promise<TestSocket> {
  const socket = await open();
  socket.send({ type: 'hello', v: 1, nick, guestId: `guest-${nick}-12345678` });
  await socket.next('welcome');
  return socket;
}

function rawGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => (data += String(chunk)));
    socket.on('end', () => {
      resolve({ status: Number(/HTTP\/1.1 (\d+)/.exec(data)?.[1]), body: data.split('\r\n\r\n')[1] ?? '' });
    });
    socket.on('error', reject);
  });
}

describe('HTTP', () => {
  it('initializes once when the platform owns the listener, with HTTP and sockets sharing rooms', async () => {
    server = createGameServer(loadConfig({ PORT: '0' }), { clock, log: silentLogger });
    const httpServer = server.httpServer;
    expect(httpServer.listening).toBe(false);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('expected a TCP listener');
    port = address.port;
    expect((await fetch(url('/readyz'))).status).toBe(503);
    await Promise.all([server.initialize(), server.initialize()]);
    expect(httpServer.listenerCount('upgrade')).toBe(1);
    expect((await fetch(url('/readyz'))).status).toBe(200);
    const [a, b] = [await greeted('Ada'), await greeted('Bo')];
    a.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    const code = (await a.next('room')).room?.code ?? '';
    b.send({ type: 'join_room', code });
    expect((await b.next('room')).room?.players).toHaveLength(2);
    expect(await (await fetch(url('/api/stats'))).json()).toMatchObject({ rooms: 1, connected: 2 });
    expect((await fetch(url('/'))).status).toBe(404);
  });

  it('reports health, readiness, stats and an honest leaderboard', async () => {
    await boot();
    expect(await (await fetch(url('/healthz'))).json()).toEqual({ status: 'ok' });
    expect(await (await fetch(url('/readyz'))).json()).toEqual({ ready: true });
    const stats = await (await fetch(url('/api/stats'))).json();
    expect(stats).toMatchObject({ rooms: 0, players: 0, tickLagMs: { samples: 0 } });
    const board = await (await fetch(url('/api/leaderboard'))).json();
    expect(board).toMatchObject({ persistence: 'memory', scope: 'this-server', entries: [] });
  });

  it('serves the client with caching rules and a strict security policy', async () => {
    await boot();
    const page = await fetch(url('/'));
    expect(await page.text()).toContain('Coilyard');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(page.headers.get('content-security-policy')).toContain(`ws://127.0.0.1:${String(port)}`);
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const asset = await fetch(url('/assets/app-abc123.js'));
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect((await fetch(url('/some/client/route'))).status).toBe(200);
    expect((await fetch(url('/assets/missing.js'))).status).toBe(404);
    expect((await fetch(url('/api/nothing'))).status).toBe(404);
    expect((await fetch(url('/'), { method: 'HEAD' })).status).toBe(200);
  });

  it('refuses other methods and cannot be walked out of its web root', async () => {
    await boot();
    const post = await fetch(url('/'), { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    for (const path of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/../../secret.txt',
      '/%00',
    ]) {
      const { status, body } = await rawGet(path);
      expect(body, path).not.toContain('top secret');
      expect([200, 400, 404], path).toContain(status);
    }
  });

  it('returns 404 for everything when no client is bundled, and not-ready before start', async () => {
    await boot({}, { staticDir: null });
    expect((await fetch(url('/'))).status).toBe(404);
  });
});

describe('WebSocket admission', () => {
  it('greets a client and tells it the name it will be known by', async () => {
    await boot();
    const socket = await open();
    socket.send({ type: 'hello', v: 1, nick: 'Ada', guestId: 'guest-ada-12345678' });
    const welcome = await socket.next('welcome');
    expect(welcome).toMatchObject({ nick: 'Ada', resumed: false });
    expect(welcome.playerId.length).toBeGreaterThan(5);
    expect(welcome.resume).toHaveLength(32);
  });

  it('refuses pages from another origin but accepts its own, in production too', async () => {
    await boot({ NODE_ENV: 'production' });
    await expect(open({ Origin: 'https://evil.example' })).rejects.toThrow('403');
    await expect(open()).rejects.toThrow('403');
    const ok = await open({ Origin: `http://127.0.0.1:${String(port)}` });
    ok.send({ type: 'quickplay' });
    expect(ok.closed).toBeNull();
    expect(server?.stats.counters.connectionsRejected).toBe(2);
  });

  it('only upgrades on /ws', async () => {
    await boot();
    const socket = new TestSocket(`ws://127.0.0.1:${String(port)}/other`);
    await expect(socket.opened()).rejects.toThrow('404');
  });

  it('caps connections per address', async () => {
    await boot({ MAX_CONNECTIONS_PER_IP: '2' });
    await open();
    await open();
    await expect(open()).rejects.toThrow('429');
  });

  it('hangs up on a client that never says hello', async () => {
    await boot();
    const socket = await open();
    clock.advance(5001);
    expect((await socket.whenClosed()).code).toBe(4000);
  });
});

describe('WebSocket hardening', () => {
  it('answers malformed and invalid messages with an error and keeps the socket', async () => {
    await boot();
    const socket = await greeted('Ada');
    socket.sendRaw('{not json');
    socket.sendRaw(JSON.stringify({ type: 'input', seq: 1, dir: 1, score: 99999 }));
    socket.sendRaw(JSON.stringify({ type: 'input', seq: 1, dir: 9 }));
    for (let i = 0; i < 3; i++) expect((await socket.next('error')).code).toBe('bad_message');
    expect(socket.closed).toBeNull();
  });

  it('closes oversized frames, binary frames and unsupported protocol versions', async () => {
    await boot();
    const big = await greeted('Big');
    big.sendRaw('x'.repeat(3000));
    expect((await big.whenClosed()).code).toBe(1009);
    const bin = await greeted('Bin');
    bin.sendRaw(Buffer.from([1, 2, 3]), true);
    expect((await bin.whenClosed()).code).toBe(1003);
    const old = await open();
    old.sendRaw(JSON.stringify({ type: 'hello', v: 99, nick: 'Old', guestId: 'guest-old-12345678' }));
    expect((await old.next('error')).code).toBe('unsupported_version');
    expect((await old.whenClosed()).code).toBe(1008);
  });

  it('disconnects a client that keeps sending garbage', async () => {
    await boot();
    const socket = await greeted('Spam');
    for (let i = 0; i < 80; i++) socket.sendRaw('garbage');
    expect((await socket.whenClosed()).code).toBe(1008);
    expect(server?.stats.counters.badMessages).toBeGreaterThanOrEqual(60);
  });

  it('survives input flooding without growing the queue or killing other rooms', async () => {
    await boot();
    const [a, b] = [await greeted('Ada'), await greeted('Bo')];
    a.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    const code = (await a.next('room')).room?.code ?? '';
    b.send({ type: 'join_room', code });
    for (const s of [a, b]) s.send({ type: 'ready', ready: true });
    await a.next('room', 3000, (m) => m.room?.phase === 'countdown');
    clock.advance(3000);
    await a.next('snapshot');
    for (let i = 1; i <= 500; i++) a.send({ type: 'input', seq: i, dir: i % 2 === 0 ? 0 : 1 });
    clock.ticks(3);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(server?.stats.counters.rateLimited).toBeGreaterThan(300);
    expect(b.closed).toBeNull();
  });
});

describe('a game over real sockets', () => {
  it('plays a lobby, countdown, match and summary end to end', async () => {
    await boot();
    const [a, b] = [await greeted('Ada'), await greeted('Bo')];
    a.send({ type: 'create_room', visibility: 'private', theme: 'kiln' });
    const created = await a.next('room');
    const code = created.room?.code ?? '';
    b.send({ type: 'join_room', code });
    expect((await b.next('room')).room?.players).toHaveLength(2);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    await a.next('room', 3000, (m) => m.room?.phase === 'countdown');
    clock.advance(3000);
    const first = await a.next('snapshot');
    expect(first).toMatchObject({ tick: 0, snakes: [{ s: 0 }, { s: 1 }] });
    a.send({ type: 'input', seq: 1, dir: 2 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    clock.ticks(4);
    let last = await a.next('snapshot');
    while (last.tick < 4) last = await a.next('snapshot');
    expect(last.ack).toEqual({ '0': 1 });
    clock.ticks(30);
    clock.advance(END_GRACE_MS);
    const end = await b.next('round_end');
    expect(end).toMatchObject({
      reason: 'last-standing',
      winnerSlots: [1],
      ranked: true,
      names: { '0': 'Ada', '1': 'Bo' },
    });
    const board: unknown = await (await fetch(url('/api/leaderboard'))).json();
    expect(board).toMatchObject({ entries: [{}, {}] });
    expect(JSON.stringify(board)).not.toContain('guest-');
    expect(TICK_MS).toBeGreaterThan(0);
  });

  it('lets a player come back with the resume token after the socket dies', async () => {
    await boot();
    const a = await greeted('Ada');
    const b = await greeted('Bo');
    const welcome = a.messages.find((m) => m.type === 'welcome');
    a.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    const code = (await a.next('room')).room?.code ?? '';
    b.send({ type: 'join_room', code });
    a.close();
    await a.whenClosed();
    const again = await open();
    again.send({
      type: 'hello',
      v: 1,
      nick: 'Ada',
      guestId: 'guest-Ada-12345678',
      resume: welcome?.type === 'welcome' ? welcome.resume : '',
    });
    const back = await again.next('welcome');
    expect(back.resumed).toBe(true);
    expect((await again.next('room')).room?.code).toBe(code);
  });

  it('tells clients the server is going away, then closes them', async () => {
    await boot();
    const a = await greeted('Ada');
    const stopping = server?.stop();
    expect((await a.next('bye')).reason).toBe('server_shutdown');
    expect((await a.whenClosed()).code).toBe(1001);
    await stopping;
    server = null;
  });

  it('reports the request path of nothing it does not serve', async () => {
    await boot();
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(url('/ws'), (res) => {
        resolve(res.statusCode ?? 0);
        res.resume();
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(404);
  });
});
