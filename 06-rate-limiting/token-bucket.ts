export interface TokenBucketOptions {
  /** How many requests may go out back to back. */
  capacity: number;
  /** How many tokens come back per second. */
  refillPerSec: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Client-side rate limiter: every request takes a token before it goes out.
 * Callers wait in line (FIFO), so a burst of 100 calls is spread out instead of rejected by the API.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private pausedUntil = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: TokenBucketOptions) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.tokens = opts.capacity;
    this.lastRefill = this.now();
  }

  /** Resolves when the caller may send its request. */
  take(): Promise<void> {
    const turn = this.queue.then(() => this.waitForToken());
    this.queue = turn;
    return turn;
  }

  /**
   * The API answered 429 with Retry-After: stop everyone, not just the request that got it.
   * Otherwise the other 49 requests in flight walk straight into the same wall.
   */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
    this.tokens = 0;
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const now = this.now();
      if (now < this.pausedUntil) {
        await this.sleep(this.pausedUntil - now);
        continue;
      }
      this.refill(now);
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.ceil(((1 - this.tokens) / this.opts.refillPerSec) * 1000));
    }
  }

  private refill(now: number): void {
    const elapsedSec = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.opts.capacity, this.tokens + elapsedSec * this.opts.refillPerSec);
    this.lastRefill = now;
  }
}

/** Wrap any call so it goes through the bucket, and so a 429 pauses the whole bucket. */
export function rateLimited<T>(
  bucket: TokenBucket,
  call: () => Promise<{ status: number; retryAfterMs?: number; value?: T }>,
) {
  return async () => {
    await bucket.take();
    const res = await call();
    if (res.status === 429) bucket.pauseFor(res.retryAfterMs ?? 1000);
    return res;
  };
}
