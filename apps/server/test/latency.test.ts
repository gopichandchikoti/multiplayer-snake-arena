import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameSocket } from '../../client/src/net/gameSocket';
import { OnlineSession } from '../../client/src/net/onlineSession';
import { loadConfig } from '../src/config';
import { silentLogger } from '../src/logger';
import { createGameServer, type GameServer } from '../src/server';
import { LatencyProxy, nodeSocket, waitFor } from './latency';

let server: GameServer;
let port = 0;
const proxies: LatencyProxy[] = [];
const sessions: OnlineSession[] = [];
const report: Record<string, unknown> = {};

beforeAll(async () => {
  server = createGameServer(
    loadConfig({ PORT: '0', HOST: '127.0.0.1', ROUND_TICKS: '60', MAX_CONNECTIONS_PER_IP: '100' }),
    { log: silentLogger },
  );
  port = (await server.start()).port;
});

afterAll(async () => {
  for (const s of sessions) s.dispose();
  for (const p of proxies) await p.close();
  await server.stop();
  await mkdir(join(import.meta.dirname, '..', 'test-results'), { recursive: true });
  await writeFile(
    join(import.meta.dirname, '..', 'test-results', 'latency-report.json'),
    JSON.stringify(report, null, 2),
  );
});

/** A headless player: the real client networking code, connected through its own proxy. */
async function player(name: string, rttMs: number) {
  const proxy = await LatencyProxy.start(port, { delayMs: rttMs / 2, jitterMs: rttMs * 0.1 });
  proxies.push(proxy);
  const socket = new GameSocket({
    url: `ws://127.0.0.1:${String(proxy.port)}/ws`,
    nick: () => name,
    guestId: `guest-${name}-12345678`,
    factory: nodeSocket,
  });
  const session = new OnlineSession(socket);
  sessions.push(session);
  session.connect();
  await waitFor(() => session.state.get().me !== null, 8000, `${name} greeting`);
  return { proxy, socket, session };
}

type Player = Awaited<ReturnType<typeof player>>;

async function startMatch(rtt: number): Promise<{ a: Player; b: Player }> {
  const a = await player('Ada', rtt);
  const b = await player('Bo', rtt);
  a.session.createRoom('private', 'parchment');
  await waitFor(() => a.session.state.get().room !== null, 8000, 'room created');
  b.session.joinRoom(a.session.state.get().room?.code ?? '');
  await waitFor(() => (b.session.state.get().room?.players.length ?? 0) === 2, 8000, 'both in room');
  a.session.setReady(true);
  b.session.setReady(true);
  await waitFor(
    () => a.session.state.get().game !== null && b.session.state.get().game !== null,
    12_000,
    'match start',
  );
  return { a, b };
}

/** How long after pressing a key the player's own snake visibly turns. */
async function responseTime(p: Player, dir: 0 | 1 | 2 | 3): Promise<number> {
  const game = p.session.state.get().game;
  if (!game) throw new Error('no game');
  const slot = game.roster.find((r) => r.isLocal)?.slot;
  const started = performance.now();
  game.turn(dir);
  const turned = (): boolean => game.frame(performance.now()).snakes.find((s) => s.slot === slot)?.dir === dir;
  await waitFor(turned, 2000, 'visible turn');
  return performance.now() - started;
}

describe.each([50, 150, 300])('with %d ms round-trip latency and jitter', (rtt) => {
  it('measures the delay, steers instantly, and finishes the round consistently', async () => {
    const { a, b } = await startMatch(rtt);
    await waitFor(() => a.socket.clock.ready && a.socket.clock.rtt > 0, 6000, 'clock sync');
    const measured = a.socket.clock.rtt;
    expect(Math.abs(measured - rtt)).toBeLessThan(Math.max(40, rtt * 0.5));

    const feel = await responseTime(a, 2);
    expect(feel).toBeLessThan(300);

    await waitFor(
      () => a.session.state.get().result !== null && b.session.state.get().result !== null,
      15_000,
      'round end',
    );
    const ra = a.session.state.get().result;
    const rb = b.session.state.get().result;
    expect(ra?.winnerSlots).toEqual(rb?.winnerSlots);
    expect(ra?.standings).toEqual(rb?.standings);
    expect(a.session.state.get().game?.badSnapshots).toBe(0);
    report[`rtt${String(rtt)}`] = {
      configuredRttMs: rtt,
      measuredRttMs: Math.round(measured),
      measuredJitterMs: Math.round(a.socket.clock.jitter),
      steeringResponseMs: Math.round(feel),
      reason: ra?.reason,
    };
  }, 40_000);
});

describe('network trouble', () => {
  it('rides out a stalled connection and keeps one consistent result', async () => {
    const { a, b } = await startMatch(100);
    a.proxy.stall(1200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    a.session.state.get().game?.turn(2);
    await waitFor(
      () => a.session.state.get().result !== null && b.session.state.get().result !== null,
      15_000,
      'round end',
    );
    expect(a.session.state.get().result?.standings).toEqual(b.session.state.get().result?.standings);
    expect(a.session.state.get().game?.badSnapshots).toBe(0);
    report.stall = { stalledMs: 1200, recovered: true };
  }, 40_000);

  it('reconnects after the connection is cut, takes the same seat back and finishes the round', async () => {
    const { a, b } = await startMatch(60);
    const before = b.session.state.get().me?.id;
    b.proxy.cut();
    await waitFor(() => b.socket.status.get().state === 'reconnecting', 4000, 'reconnecting state');
    await waitFor(() => b.socket.status.get().state === 'open', 8000, 'reconnected');
    expect(b.session.state.get().me?.id).toBe(before);
    expect(b.session.state.get().room?.players.find((p) => p.id === before)?.connected).toBe(true);
    await waitFor(() => a.session.state.get().result !== null, 15_000, 'round end');
    expect(a.session.state.get().result?.standings).toHaveLength(2);
    report.reconnect = { resumed: true, sameSeat: true };
  }, 40_000);

  it('keeps the tick clock steady while many clients are connected', () => {
    const lag = server.stats.tickLag();
    report.tickLagMs = lag;
    expect(lag.samples).toBeGreaterThan(100);
    expect(lag.p99).toBeLessThan(60);
  });
});
