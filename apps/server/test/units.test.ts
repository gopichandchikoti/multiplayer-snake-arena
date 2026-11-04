import { describe, expect, it, vi } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { createLogger, redact, silentLogger } from '../src/logger';
import { parseClientMessage } from '../src/parse';
import { generateRoomCode } from '../src/roomManager';
import { IpLimiter, TokenBucket, isOriginAllowed } from '../src/security';
import { Stats } from '../src/stats';
import { clientAddress } from '../src/gateway';
import { resolveStaticPath, securityHeaders } from '../src/http';
import { FakeClock, jsonField } from './harness';

describe('config', () => {
  it('has safe defaults for development', () => {
    expect(loadConfig({})).toMatchObject({
      host: '127.0.0.1',
      port: 5722,
      production: false,
      allowNoOrigin: true,
      allowedOrigins: [],
      leaderboardFile: null,
      maxConnectionsPerIp: 8,
      maxRooms: 200,
      trustProxy: false,
      logLevel: 'info',
    });
  });

  it('turns production on and stops accepting origin-less sockets unless told otherwise', () => {
    expect(loadConfig({ NODE_ENV: 'production' })).toMatchObject({ production: true, allowNoOrigin: false });
    expect(loadConfig({ NODE_ENV: 'production', ALLOW_NO_ORIGIN: 'true' }).allowNoOrigin).toBe(true);
  });

  it('reads and trims settings', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '0.0.0.0',
      ALLOWED_ORIGINS: ' https://a.example , https://b.example,, ',
      LEADERBOARD_FILE: '/data/board.json',
      STATIC_DIR: '/srv/web',
      MAX_ROOMS: '5',
      TRUST_PROXY: 'true',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({ port: 8080, host: '0.0.0.0', maxRooms: 5, trustProxy: true, logLevel: 'debug' });
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.leaderboardFile).toBe('/data/board.json');
    expect(config.staticDir).toBe('/srv/web');
  });

  it.each([{ PORT: 'abc' }, { PORT: '70000' }, { MAX_ROOMS: '0' }, { LOG_LEVEL: 'loud' }, { ROUND_TICKS: '3' }])(
    'rejects %j with a message that names the setting',
    (env) => {
      expect(() => loadConfig(env)).toThrow(ConfigError);
    },
  );
});

describe('logger', () => {
  it('writes one JSON object per line with time, level and fields', () => {
    const lines: string[] = [];
    const log = createLogger({
      level: 'info',
      sink: (l) => lines.push(l),
      now: () => new Date('2026-01-02T03:04:05Z'),
    });
    log.info('hello', { room: 'ABCDE' });
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      t: '2026-01-02T03:04:05.000Z',
      level: 'info',
      msg: 'hello',
      room: 'ABCDE',
    });
  });

  it('filters by level and carries child bindings', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'warn', sink: (l) => lines.push(l) }).child({ conn: 'x1' });
    log.debug('no');
    log.info('no');
    log.warn('yes');
    log.error('also');
    expect(lines.map((l) => jsonField(l, 'conn'))).toEqual(['x1', 'x1']);
    expect(lines).toHaveLength(2);
  });

  it('never writes secrets, at any depth', () => {
    expect(redact({ resume: 'abc', Token: 'x', nested: { password: 'p', fine: 1 }, list: [1], ok: 'y' })).toEqual({
      resume: '[redacted]',
      Token: '[redacted]',
      nested: { password: '[redacted]', fine: 1 },
      list: [1],
      ok: 'y',
    });
    const lines: string[] = [];
    createLogger({ level: 'info', sink: (l) => lines.push(l), bindings: { secret: 's3' } }).info('m', { resume: 'r3' });
    expect(lines[0]).not.toContain('s3');
    expect(lines[0]).not.toContain('r3');
  });

  it('can be silenced for tests and defaults to stdout', () => {
    expect(() => silentLogger.error('nothing happens')).not.toThrow();
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    createLogger({ level: 'info' }).info('to stdout');
    expect(String(write.mock.calls[0]?.[0])).toContain('"msg":"to stdout"');
    write.mockRestore();
  });
});

describe('origin policy', () => {
  const dev = { allowedOrigins: [], allowNoOrigin: true, production: false };
  const prod = { allowedOrigins: [], allowNoOrigin: false, production: true };

  it('accepts the page that served the socket, and refuses any other site', () => {
    expect(isOriginAllowed('https://play.example', 'play.example', prod)).toBe(true);
    expect(isOriginAllowed('https://evil.example', 'play.example', prod)).toBe(false);
    expect(isOriginAllowed('http://play.example:81', 'play.example', prod)).toBe(false);
  });

  it('handles missing, null, malformed and non-web origins', () => {
    expect(isOriginAllowed(undefined, 'h', dev)).toBe(true);
    expect(isOriginAllowed(undefined, 'h', prod)).toBe(false);
    for (const bad of ['null', 'not a url', 'file:///x', 'chrome-extension://abc']) {
      expect(isOriginAllowed(bad, 'h', dev)).toBe(false);
    }
  });

  it('allows local development origins only outside production', () => {
    expect(isOriginAllowed('http://localhost:5720', 'api.example', dev)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5720', 'api.example', dev)).toBe(true);
    expect(isOriginAllowed('http://localhost:5720', 'api.example', prod)).toBe(false);
  });

  it('uses an explicit allow-list when one is configured', () => {
    const listed = { ...prod, allowedOrigins: ['https://game.example'] };
    expect(isOriginAllowed('https://game.example', 'other', listed)).toBe(true);
    expect(isOriginAllowed('https://game.example:8443', 'other', listed)).toBe(false);
    expect(isOriginAllowed('https://other', 'other', listed)).toBe(false);
  });
});

describe('rate limiting', () => {
  it('lets a burst through, then refills at the configured rate', () => {
    const clock = new FakeClock();
    const bucket = new TokenBucket(10, 5, clock);
    expect([1, 2, 3, 4, 5, 6].map(() => bucket.take())).toEqual([true, true, true, true, true, false]);
    clock.advance(100);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
    clock.advance(10_000);
    expect([1, 2, 3, 4, 5, 6].map(() => bucket.take())).toEqual([true, true, true, true, true, false]);
    expect(bucket.take(0)).toBe(true);
  });

  it('caps sockets per address and frees slots on release', () => {
    const limiter = new IpLimiter(2);
    expect([limiter.acquire('a'), limiter.acquire('a'), limiter.acquire('a'), limiter.acquire('b')]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(limiter.total()).toBe(3);
    limiter.release('a');
    expect(limiter.acquire('a')).toBe(true);
    limiter.release('b');
    limiter.release('b');
    expect(limiter.total()).toBe(2);
  });
});

describe('message parsing', () => {
  it('accepts valid messages', () => {
    expect(parseClientMessage('{"type":"quickplay"}')).toEqual({ ok: true, msg: { type: 'quickplay' } });
  });

  it.each([
    ['not json', 'bad_message'],
    ['null', 'bad_message'],
    ['{"type":"input","seq":1,"dir":1,"x":3}', 'bad_message'],
    ['{"type":"unknown"}', 'bad_message'],
    ['{"type":"hello","v":99,"nick":"a","guestId":"abcdefgh"}', 'unsupported_version'],
  ])('refuses %s with %s', (text, code) => {
    expect(parseClientMessage(text)).toEqual({ ok: false, code });
  });
});

describe('small helpers', () => {
  it('makes room codes from the unambiguous alphabet and retries on collision', () => {
    const taken = new Set(['AAAAA']);
    const fixed = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5];
    let i = 0;
    const code = generateRoomCode(
      (c) => taken.has(c),
      () => fixed[i++] ?? 0,
    );
    expect(code).toBe('BCDEF');
    expect(generateRoomCode(() => false)).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
    expect(() => generateRoomCode(() => true)).toThrow();
  });

  it('keeps tick-lag percentiles over a rolling window', () => {
    const stats = new Stats(0);
    expect(stats.tickLag()).toEqual({ samples: 0, p50: 0, p99: 0, max: 0 });
    for (let i = 1; i <= 100; i++) stats.recordTickLag(i);
    stats.recordTickLag(-5);
    expect(stats.tickLag()).toMatchObject({ samples: 101, max: 100 });
    expect(stats.tickLag().p99).toBeGreaterThan(95);
    expect(stats.counters.ticks).toBe(101);
    for (let i = 0; i < 600; i++) stats.recordTickLag(1);
    expect(stats.tickLag().samples).toBe(512);
  });

  it('reads the client address from the socket, or the proxy header only when trusted', () => {
    const req = (forwarded?: string) => ({
      headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
      socket: { remoteAddress: '1.2.3.4' },
    });
    expect(clientAddress(req('9.9.9.9, 8.8.8.8'), false)).toBe('1.2.3.4');
    expect(clientAddress(req('9.9.9.9, 8.8.8.8'), true)).toBe('9.9.9.9');
    expect(clientAddress(req(), true)).toBe('1.2.3.4');
    expect(clientAddress({ headers: {}, socket: {} }, false)).toBe('unknown');
  });

  it('keeps static paths inside the web root', () => {
    expect(resolveStaticPath('/srv/web', '/assets/app.js')).toMatch(/assets[\\/]app\.js$/);
    expect(resolveStaticPath('/srv/web', '/')).not.toBeNull();
    for (const evil of ['/../secret', '/%2e%2e/secret', '/a/../../b', '/%00', '/%zz']) {
      expect(resolveStaticPath('/srv/web', evil)).toBeNull();
    }
  });

  it('sets a CSP that only lets the page open sockets to its own host, and HSTS only over https', () => {
    const csp = securityHeaders('play.example:5722', false)['Content-Security-Policy'] ?? '';
    expect(csp).toContain("connect-src 'self' ws://play.example:5722 wss://play.example:5722");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(securityHeaders(undefined, false)['Content-Security-Policy']).toContain("connect-src 'self'");
    expect(securityHeaders('h', false)['Strict-Transport-Security']).toBeUndefined();
    expect(securityHeaders('h', true)['Strict-Transport-Security']).toContain('max-age');
  });
});
