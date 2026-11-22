/**
 * An API that allows `limit` requests per sliding `windowMs`; anything over gets a 429.
 * In-process, so the demo needs no network.
 */
export function createLimitedApi(limit: number, windowMs = 1000, now: () => number = Date.now) {
  const recent: number[] = [];
  let ok = 0;
  let rejected = 0;
  return {
    stats: () => ({ ok, rejected }),
    async call(): Promise<{ status: number; retryAfterMs?: number }> {
      const t = now();
      while (recent.length && recent[0]! <= t - windowMs) recent.shift();
      if (recent.length >= limit) {
        rejected++;
        return { status: 429, retryAfterMs: recent[0]! + windowMs - t };
      }
      recent.push(t);
      ok++;
      return { status: 200 };
    },
  };
}
