export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug: (msg: string, fields?: Fields) => void;
  info: (msg: string, fields?: Fields) => void;
  warn: (msg: string, fields?: Fields) => void;
  error: (msg: string, fields?: Fields) => void;
  child: (bindings: Fields) => Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Field names whose values are never written to a log, whatever they contain. */
const SECRET_KEYS = new Set(['resume', 'token', 'authorization', 'cookie', 'secret', 'password']);

/** Copies `fields`, replacing secret values (at any depth) with a marker. */
export function redact(fields: Fields): Fields {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.has(key.toLowerCase())) out[key] = '[redacted]';
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) out[key] = redact({ ...value });
    else out[key] = value;
  }
  return out;
}

interface Options {
  level: LogLevel;
  sink?: (line: string) => void;
  bindings?: Fields;
  now?: () => Date;
}

/** One JSON object per line, so logs can be searched and shipped without parsing prose. */
export function createLogger(options: Options): Logger {
  const sink = options.sink ?? ((line: string): void => void process.stdout.write(`${line}\n`));
  const now = options.now ?? ((): Date => new Date());
  const bindings = options.bindings ?? {};
  const write = (level: LogLevel, msg: string, fields: Fields = {}): void => {
    if (ORDER[level] < ORDER[options.level]) return;
    sink(JSON.stringify({ t: now().toISOString(), level, msg, ...redact(bindings), ...redact(fields) }));
  };
  return {
    debug: (msg, fields) => {
      write('debug', msg, fields);
    },
    info: (msg, fields) => {
      write('info', msg, fields);
    },
    warn: (msg, fields) => {
      write('warn', msg, fields);
    },
    error: (msg, fields) => {
      write('error', msg, fields);
    },
    child: (extra) => createLogger({ ...options, bindings: { ...bindings, ...extra } }),
  };
}

export const silentLogger: Logger = createLogger({ level: 'error', sink: () => undefined });
