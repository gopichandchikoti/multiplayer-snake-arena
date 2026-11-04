// Load test: many rooms of eight real WebSocket clients against an in-process server.
// Usage: pnpm load -- [--rooms 16] [--seconds 20]
import { performance } from 'node:perf_hooks';
import WebSocket, { type RawData } from 'ws';
import { serverMsgSchema } from '../packages/shared/src';
import { loadConfig } from '../apps/server/src/config';
import { silentLogger } from '../apps/server/src/logger';
import { createGameServer, type GameServer } from '../apps/server/src/server';

const args = process.argv.slice(2);
const option = (name: string, fallback: number): number => {
  const at = args.indexOf(`--${name}`);
  const value = Number(at >= 0 ? args[at + 1] : fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const ROOMS = option('rooms', 16);
const SECONDS = option('seconds', 20);
const PER_ROOM = 8;

const deliveryMs: number[] = [];
const totals = { snapshots: 0, bytes: 0, inputs: 0, errors: 0 };

type RoomHandler = (code: string | null, phase: string | null) => void;

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
}

class Client {
  private readonly ws: WebSocket;
  code = '';
  playing = false;
  private readied = false;

  constructor(
    url: string,
    name: string,
    private readonly onRoom: RoomHandler,
  ) {
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this.send({ type: 'hello', v: 1, nick: name, guestId: `load-${name}-12345678` });
    });
    this.ws.on('message', (data) => {
      this.receive(data);
    });
    this.ws.on('error', () => {
      totals.errors += 1;
    });
  }

  send(msg: object): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }

  /** Marks this client ready, once per round. */
  ready(): void {
    if (this.readied) return;
    this.readied = true;
    this.send({ type: 'ready', ready: true });
  }

  turnSometimes(seq: number): void {
    if (!this.playing) return;
    this.send({ type: 'input', seq, dir: Math.floor(Math.random() * 4) });
    totals.inputs += 1;
  }

  private receive(data: RawData): void {
    const received = Date.now();
    const text = rawText(data);
    totals.bytes += text.length;
    const parsed = serverMsgSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return;
    const msg = parsed.data;
    if (msg.type === 'snapshot') {
      totals.snapshots += 1;
      this.playing = true;
      deliveryMs.push(received - msg.time);
    } else if (msg.type === 'room') {
      // After a round ends, be ready again for the next one so rooms keep playing.
      if (msg.room?.phase === 'summary') this.readied = false;
      this.onRoom(msg.room?.code ?? null, msg.room?.phase ?? null);
    }
  }
}

const percentile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

function startRoom(url: string, index: number, clients: Client[]): void {
  const host: Client = new Client(url, `h${String(index)}`, (code, phase) => {
    if (host.code && phase === 'lobby') host.ready();
    if (!code || host.code) return;
    host.code = code;
    for (let i = 1; i < PER_ROOM; i++) {
      const guest: Client = new Client(url, `r${String(index)}p${String(i)}`, (_code, guestPhase) => {
        if (guestPhase === 'lobby') guest.ready();
      });
      clients.push(guest);
      setTimeout(
        () => {
          guest.send({ type: 'join_room', code });
        },
        300 + i * 20,
      );
    }
    setTimeout(() => {
      host.ready();
    }, 1500);
  });
  clients.push(host);
  setTimeout(
    () => {
      host.send({ type: 'create_room', visibility: 'private', theme: 'parchment' });
    },
    400 + index * 15,
  );
}

function summarise(server: GameServer, clients: Client[], elapsed: number, cpu: NodeJS.CpuUsage): object {
  const lag = server.stats.tickLag();
  const inMatch = clients.filter((c) => c.playing).length;
  const playing = Math.max(1, inMatch);
  return {
    rooms: ROOMS,
    clients: clients.length,
    clientsInMatch: inMatch,
    seconds: Math.round(elapsed),
    serverTickLagMs: { p50: round1(lag.p50), p99: round1(lag.p99), max: round1(lag.max) },
    snapshotDeliveryMs: { p50: percentile(deliveryMs, 0.5), p99: percentile(deliveryMs, 0.99) },
    snapshotsPerClientPerSecondAveraged: Math.round(totals.snapshots / playing / elapsed),
    kilobytesPerClientPerSecondAveraged: Math.round(totals.bytes / 1024 / playing / elapsed),
    averageSnapshotBytes: Math.round(totals.bytes / Math.max(1, totals.snapshots)),
    inputsSent: totals.inputs,
    inputsAccepted: server.stats.counters.inputsAccepted,
    rateLimited: server.stats.counters.rateLimited,
    socketErrors: totals.errors,
    wholeProcessCpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / (elapsed * 1000)) * 100),
    rssMegabytes: Math.round(process.memoryUsage().rss / 1024 / 1024),
    note: 'Server and all clients share one Node process, so CPU is an upper bound for the server alone.',
  };
}

async function main(): Promise<void> {
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    ROUND_TICKS: String(Math.max(30, SECONDS * 15 + 200)),
    MAX_CONNECTIONS_PER_IP: '1000',
    MAX_ROOMS: String(ROOMS + 10),
  });
  const server = createGameServer(config, { log: silentLogger });
  const { port } = await server.start();
  const clients: Client[] = [];
  const cpuStart = process.cpuUsage();
  for (let r = 0; r < ROOMS; r++) startRoom(`ws://127.0.0.1:${String(port)}/ws`, r, clients);

  const started = performance.now();
  let seq = 0;
  const steer = setInterval(() => {
    seq += 1;
    for (const c of clients) if (Math.random() < 0.25) c.turnSometimes(seq);
  }, 150);
  await new Promise((resolve) => setTimeout(resolve, (SECONDS + 5) * 1000));
  clearInterval(steer);
  const elapsed = (performance.now() - started) / 1000;
  process.stdout.write(`${JSON.stringify(summarise(server, clients, elapsed, process.cpuUsage(cpuStart)), null, 2)}\n`);
  for (const c of clients) c.close();
  await server.stop();
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  },
);
