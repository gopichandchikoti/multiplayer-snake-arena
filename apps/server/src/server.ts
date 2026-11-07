import { randomInt } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type Clock, systemClock } from './clock';
import type { ServerConfig } from './config';
import { attachGateway, type Gateway } from './gateway';
import { createHttpHandler } from './http';
import { Hub } from './hub';
import { Leaderboard } from './leaderboard';
import { type Logger, createLogger } from './logger';
import { RoomManager } from './roomManager';
import { IpLimiter } from './security';
import { Stats } from './stats';

export interface GameServer {
  /** The platform can own the listener while sharing the same HTTP and WebSocket state. */
  readonly httpServer: Server;
  initialize: () => Promise<void>;
  start: () => Promise<{ host: string; port: number }>;
  stop: () => Promise<void>;
  readonly rooms: RoomManager;
  readonly hub: Hub;
  readonly stats: Stats;
  readonly leaderboard: Leaderboard;
}

interface Overrides {
  clock?: Clock;
  log?: Logger;
}

interface Parts {
  clock: Clock;
  log: Logger;
  stats: Stats;
  leaderboard: Leaderboard;
  rooms: RoomManager;
  hub: Hub;
}

function buildParts(config: ServerConfig, overrides: Overrides): Parts {
  const clock = overrides.clock ?? systemClock;
  const log = overrides.log ?? createLogger({ level: config.logLevel });
  const stats = new Stats(clock.now());
  const leaderboard = new Leaderboard(clock, config.leaderboardFile, log);
  const rooms = new RoomManager(
    { clock, log, stats, leaderboard, roundTicks: config.roundTicks, random32: () => randomInt(0, 2 ** 32) },
    config.maxRooms,
  );
  return { clock, log, stats, leaderboard, rooms, hub: new Hub({ clock, log, rooms }) };
}

function listen(server: Server, config: ServerConfig): Promise<{ host: string; port: number }> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') reject(new Error('server has no TCP address'));
      else resolve({ host: address.address, port: address.port });
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Wires the whole server together. Nothing is listening until `start()` is called. */
export function createGameServer(config: ServerConfig, overrides: Overrides = {}): GameServer {
  const { clock, log, stats, leaderboard, rooms, hub } = buildParts(config, overrides);
  let ready = false;
  let gateway: Gateway | null = null;
  let initialization: Promise<void> | undefined;
  const server = createServer(
    createHttpHandler({
      staticDir: config.staticDir,
      leaderboard,
      rooms,
      hub,
      stats,
      ready: () => ready,
      now: clock.now,
    }),
  );
  const initialize = (): Promise<void> =>
    (initialization ??= leaderboard.load().then(() => {
      const limiter = new IpLimiter(config.maxConnectionsPerIp);
      const session = { hub, rooms, clock, log, stats };
      gateway = attachGateway(server, { config, session, limiter, stats, log, clock });
      ready = true;
    }));

  return {
    httpServer: server,
    initialize,
    rooms,
    hub,
    stats,
    leaderboard,
    async start() {
      await initialize();
      const address = await listen(server, config);
      log.info('server_listening', { ...address, production: config.production });
      return address;
    },
    async stop() {
      ready = false;
      await gateway?.close();
      rooms.closeAll();
      hub.clear();
      await closeHttpServer(server);
      await leaderboard.flush();
      log.info('server_stopped');
    },
  };
}
