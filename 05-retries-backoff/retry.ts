/** An HTTP failure, carrying what a retry decision needs. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Retry only what can succeed next time:
 *   - 408, 429 and 5xx
 *   - network errors and timeouts (fetch throws TypeError / TimeoutError)
 * A 400 or 404 will fail the same way forever, so retrying it just adds load.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  if (err instanceof Error) return err.name === 'TypeError' || err.name === 'TimeoutError' || err.name === 'AbortError';
  return false;
}

/** Retry-After is either seconds ("120") or an HTTP date. Returns milliseconds, or undefined. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Exponential backoff with "full jitter": a random delay between 0 and base * 2^(attempt-1), capped.
 * Without the randomness, every client that failed together retries together, and knocks the server over again.
 */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

export interface RetryOptions {
  /** Total tries, including the first one. Default 5. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Give up once this much time has passed overall, even with attempts left. Default 30s. */
  budgetMs?: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
    budgetMs = 30_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    random = Math.random,
    now = Date.now,
  } = opts;
  const retryable = opts.isRetryable ?? isRetryable;
  const startedAt = now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !retryable(error)) throw error;

      // The server told us when to come back: listen to it.
      const hinted = error instanceof HttpError ? error.retryAfterMs : undefined;
      const delayMs = hinted ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      if (now() - startedAt + delayMs > budgetMs) throw error;

      opts.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
