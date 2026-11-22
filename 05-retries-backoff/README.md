# 05 · Retries and exponential backoff

A retry looks like one line of code. Done wrong, it turns a 30-second blip into a full outage: every client retries at once, immediately, forever, including on errors that will never succeed.

| File | What it does |
|---|---|
| [`retry.ts`](retry.ts) | `retry()`, `backoffDelay()` with full jitter, `isRetryable()`, `parseRetryAfter()` |

## What to retry

| Retry ✅ | Don't retry ❌ |
|---|---|
| `408`, `429`, `5xx` | `400`, `401`, `403`, `404`, `422` |
| network errors, timeouts | validation and business errors |

A non-idempotent call (like creating a payment) is only safe to retry with an idempotency key. That's [part 07](../07-idempotency).

## Run it

```bash
npm run part5
```

```
1) Retry what can recover, stop on what cannot

  503, 503, then OK
    attempt 1 failed (HTTP 503) -> waiting 17 ms
    attempt 2 failed (HTTP 503) -> waiting 36 ms
    ✅ "ok" after 3 call(s)

  400 Bad Request
    ❌ gave up after 1 call(s): HTTP 400

  429 with Retry-After: 1s
    attempt 1 failed (HTTP 429) -> waiting 1000 ms
    ✅ "ok" after 2 call(s)

  down for good
    ...
    ❌ gave up after 5 call(s): HTTP 503

2) Why jitter: 1,000 clients fail at the same moment and retry

  fixed backoff  : busiest 100 ms gets 1000 requests ██████████████████████████████████████████████████
  full jitter    : busiest 100 ms gets  135 requests ███████
```

The waits are random by design, so your numbers will differ a little.

## Takeaways

1. **Only retry what can succeed next time.** Retrying a `400` is just more load.
2. **Back off exponentially:** 200 ms, 400 ms, 800 ms... with a cap.
3. **Add jitter.** Without it, every client that failed together retries together.
4. **Honor `Retry-After`.** The server is telling you exactly when to come back.
5. **Limit attempts *and* total time,** so a request never retries longer than anyone is waiting for it.
