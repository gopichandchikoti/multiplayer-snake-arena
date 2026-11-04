import { ROUND_TICKS } from '@snake/shared';

export interface ServerConfig {
  host: string;
  port: number;
  production: boolean;
  /** Exact browser origins allowed to open a WebSocket. Empty means "same host as the page". */
  allowedOrigins: readonly string[];
  /** Clients without an Origin header (scripts, tests, load tools). Refused in production. */
  allowNoOrigin: boolean;
  leaderboardFile: string | null;
  staticDir: string | null;
  maxConnectionsPerIp: number;
  maxRooms: number;
  roundTicks: number;
  /** Read the client address from X-Forwarded-For. Only enable behind a proxy you control. */
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigError extends Error {}

interface Range {
  fallback: number;
  min: number;
  max: number;
}

function integer(env: Readonly<Record<string, string | undefined>>, key: string, range: Range): number {
  const { fallback, min, max } = range;
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** Reads and validates settings from environment variables; every value has a safe default. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const level = env.LOG_LEVEL ?? 'info';
  const logLevel = LEVELS.find((l) => l === level);
  if (!logLevel) throw new ConfigError(`LOG_LEVEL must be one of ${LEVELS.join(', ')}`);
  return {
    host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', { fallback: 5722, min: 0, max: 65535 }),
    production,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    allowNoOrigin: env.ALLOW_NO_ORIGIN ? env.ALLOW_NO_ORIGIN === 'true' : !production,
    leaderboardFile: env.LEADERBOARD_FILE || null,
    staticDir: env.STATIC_DIR || null,
    maxConnectionsPerIp: integer(env, 'MAX_CONNECTIONS_PER_IP', { fallback: 8, min: 1, max: 1000 }),
    maxRooms: integer(env, 'MAX_ROOMS', { fallback: 200, min: 1, max: 10000 }),
    roundTicks: integer(env, 'ROUND_TICKS', { fallback: ROUND_TICKS, min: 30, max: 100000 }),
    trustProxy: env.TRUST_PROXY === 'true',
    logLevel,
  };
}
