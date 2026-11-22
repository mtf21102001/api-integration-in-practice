# 06 · Rate limiting without getting blocked

Most APIs limit how many requests you may send: 10 per second, 1,000 per hour. Go over and you get `429 Too Many Requests`; keep going over and some providers throttle or suspend your key.

Waiting for the 429 and then retrying is the slow way. The fast way is to **never send the request that would be rejected**.

| File | What it does |
|---|---|
| [`token-bucket.ts`](token-bucket.ts) | A client-side token bucket with a FIFO queue, `pauseFor()` on 429, and a `rateLimited()` wrapper |
| [`fake-api.ts`](fake-api.ts) | An in-process API with a sliding-window limit |

## How a token bucket works

The bucket holds up to `capacity` tokens and refills at `refillPerSec`. Every request takes a token before it goes out; if the bucket is empty, the request waits its turn. Bursts are smoothed out instead of rejected.

## Run it

```bash
npm run part6
```

```
The API allows 10 requests/second. We need to send 30.

  1) Promise.all, no limiter      -> 10 OK, 20 x 429 ❌
  2) token bucket (9/s)           -> 30 OK,  0 x 429 ✅ in 3.3s
```

## Takeaways

1. **Limit on your side**, before the request leaves, instead of reacting to 429s.
2. **Stay a little under the published limit.** Clocks, windows and other clients sharing your key all eat into the margin.
3. **One bucket per key, shared by everything that uses the key**: workers, cron jobs, the web app. With several processes, keep the bucket in Redis.
4. **On a 429, pause everyone**, not just the request that got it, for as long as `Retry-After` says.
5. **Read the rate-limit headers** (`X-RateLimit-Remaining`, `RateLimit-Reset`) when the API sends them, and adjust.
