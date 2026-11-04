import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config';
import { createLogger } from './logger';
import { createGameServer } from './server';

/** The built client sits next to the server bundle in a normal deployment. */
function defaultStaticDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '../../client/dist'), join(here, 'client'), join(here, '../client/dist')];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null;
}

async function main(): Promise<void> {
  const config = (() => {
    try {
      const loaded = loadConfig(process.env);
      return { ...loaded, staticDir: loaded.staticDir ?? defaultStaticDir() };
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'invalid_config', detail: error.message })}\n`);
      return process.exit(1);
    }
  })();
  const log = createLogger({ level: config.logLevel });
  const server = createGameServer(config, { log });
  await server.start();
  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log.info('shutdown_requested', { signal });
    server.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled_rejection', { reason: String(reason) });
    shutdown('unhandledRejection');
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'startup_failed', detail: String(error) })}\n`);
  process.exit(1);
});
