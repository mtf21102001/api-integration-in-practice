import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignInput {
  secret: string;
  method: string;
  path: string;
  /** Unix seconds. Part of the signature, so an old request can't be replayed later. */
  timestamp: number;
  /** The body exactly as sent over the wire. Not a re-serialized object. */
  rawBody: string;
}

export function sign(input: SignInput): string {
  const payload = `${input.timestamp}.${input.method.toUpperCase()}.${input.path}.${input.rawBody}`;
  return createHmac('sha256', input.secret).update(payload).digest('hex');
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'stale_timestamp' | 'bad_signature' };

export function verify(
  input: SignInput & { signature: string; toleranceSec?: number; nowSec?: number },
): VerifyResult {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - input.timestamp) > (input.toleranceSec ?? 300)) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = Buffer.from(sign(input), 'hex');
  const given = Buffer.from(input.signature, 'hex');
  // Constant-time compare, so the check doesn't leak how many characters matched.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
