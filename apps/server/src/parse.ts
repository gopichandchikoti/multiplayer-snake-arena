import { PROTOCOL_VERSION, clientMsgSchema, type ClientMsg, type ErrorCode } from '@snake/shared';

export type Parsed = { ok: true; msg: ClientMsg } | { ok: false; code: ErrorCode };

function isVersionMismatch(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'hello' &&
    'v' in value &&
    typeof value.v === 'number' &&
    value.v !== PROTOCOL_VERSION
  );
}

/** Turns one text frame into a validated message, or says why it was refused. Never throws. */
export function parseClientMessage(text: string): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 'bad_message' };
  }
  if (isVersionMismatch(raw)) return { ok: false, code: 'unsupported_version' };
  const result = clientMsgSchema.safeParse(raw);
  return result.success ? { ok: true, msg: result.data } : { ok: false, code: 'bad_message' };
}
