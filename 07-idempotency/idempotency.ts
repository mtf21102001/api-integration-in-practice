import { createHash } from 'node:crypto';

export interface StoredResponse {
  status: number;
  body: unknown;
}

type Entry =
  | { state: 'in_progress'; fingerprint: string; expiresAt: number }
  | { state: 'done'; fingerprint: string; expiresAt: number; response: StoredResponse };

export interface IdempotentResult extends StoredResponse {
  /** true when this is a stored answer from an earlier request with the same key. */
  replayed: boolean;
}

/** Same payload -> same fingerprint, whatever order the keys came in. */
export function fingerprint(payload: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
        : v;
  return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

/**
 * Server side of the Idempotency-Key header.
 *
 *   first request with a key   -> run the handler, store its response
 *   same key, same payload     -> return the stored response, don't run again
 *   same key, other payload    -> 422: the client reused a key by mistake
 *   same key, still running    -> 409: a double click or an eager retry; try again shortly
 *   handler threw              -> forget the key, so a retry can really retry
 *
 * In production this map is a table or Redis with a unique constraint on the key.
 */
export class IdempotencyStore {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  async run(key: string, payload: unknown, handler: () => Promise<StoredResponse>): Promise<IdempotentResult> {
    const fp = fingerprint(payload);
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > this.now()) {
      if (existing.fingerprint !== fp) {
        return { status: 422, body: { error: 'Idempotency-Key reused with a different payload' }, replayed: false };
      }
      if (existing.state === 'in_progress') {
        return { status: 409, body: { error: 'A request with this Idempotency-Key is still in progress' }, replayed: false };
      }
      return { ...existing.response, replayed: true };
    }

    // Claim the key before doing the work, so a concurrent duplicate sees "in progress".
    this.entries.set(key, { state: 'in_progress', fingerprint: fp, expiresAt: this.now() + this.ttlMs });
    try {
      const response = await handler();
      this.entries.set(key, { state: 'done', fingerprint: fp, expiresAt: this.now() + this.ttlMs, response });
      return { ...response, replayed: false };
    } catch (err) {
      this.entries.delete(key);
      throw err;
    }
  }
}
