import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Leaderboard } from './leaderboard';
import type { RoomManager } from './roomManager';
import type { Stats } from './stats';
import type { Hub } from './hub';

export interface HttpDeps {
  staticDir: string | null;
  leaderboard: Leaderboard;
  rooms: RoomManager;
  hub: Hub;
  stats: Stats;
  ready: () => boolean;
  now: () => number;
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Headers every response carries. The CSP lets the page talk only to this host's WebSocket. */
export function securityHeaders(host: string | undefined, https: boolean): Record<string, string> {
  const socket = host ? `ws://${host} wss://${host}` : '';
  const headers: Record<string, string> = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self' ${socket}`.trim(),
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (https) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string>): void {
  res.writeHead(status, {
    ...headers,
    'Content-Type': TYPES['.json'] ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/** Maps a URL path onto a file under `root`, or null if it would escape it. */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // A "..", or a NUL byte, is never legitimate in a request path: refuse it rather than quietly normalising it.
  const segments = decoded.split(/[\\/]/);
  if (decoded.includes('\0') || segments.includes('..')) return null;
  const base = resolve(root);
  const target = resolve(join(base, normalize(decoded)));
  return target === base || target.startsWith(base + sep) ? target : null;
}

async function fileFor(root: string, urlPath: string): Promise<string | null> {
  const target = resolveStaticPath(root, urlPath);
  if (!target) return null;
  const candidates = [target, join(target, 'index.html')];
  if (!extname(urlPath)) candidates.push(join(resolve(root), 'index.html'));
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) return candidate;
  }
  return null;
}

async function serveStatic(
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
  headers: Record<string, string>,
): Promise<void> {
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  const file = await fileFor(root, urlPath);
  if (!file) return json(res, 404, { error: 'not_found' }, headers);
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    ...headers,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

function api(path: string, deps: HttpDeps, res: ServerResponse, headers: Record<string, string>): boolean {
  switch (path) {
    case '/healthz':
      json(res, 200, { status: 'ok' }, headers);
      return true;
    case '/readyz':
      json(res, deps.ready() ? 200 : 503, { ready: deps.ready() }, headers);
      return true;
    case '/api/leaderboard':
      json(res, 200, deps.leaderboard.top(20), headers);
      return true;
    case '/api/stats':
      json(res, 200, statsBody(deps), headers);
      return true;
    default:
      return false;
  }
}

function statsBody(deps: HttpDeps): unknown {
  return {
    uptimeSeconds: Math.round((deps.now() - deps.stats.startedAt) / 1000),
    rooms: deps.rooms.count(),
    players: deps.hub.playerCount(),
    connected: deps.hub.connectedCount(),
    counters: deps.stats.counters,
    tickLagMs: deps.stats.tickLag(),
  };
}

export function createHttpHandler(deps: HttpDeps): RequestListener {
  return (req, res) => {
    const https = req.headers['x-forwarded-proto'] === 'https';
    const headers = securityHeaders(req.headers.host, https);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return json(res, 405, { error: 'method_not_allowed' }, headers);
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (api(path, deps, res, headers)) return;
    if (!deps.staticDir || path.startsWith('/api/') || path === '/ws')
      return json(res, 404, { error: 'not_found' }, headers);
    serveStatic(deps.staticDir, req, res, headers).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'internal_error' }, headers);
      else res.destroy();
    });
  };
}
