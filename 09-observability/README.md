# 09 · Logging and observability for integrations

It's 3 AM and orders are failing. Is it your code, or the provider? Which provider? Since when? For which requests?

If your logs say `Error: request failed`, you can't answer any of that. Observability for integrations comes down to three things: **structured logs**, **a correlation id** on every line, and **per-provider metrics**.

| File | What it does |
|---|---|
| [`context.ts`](context.ts) | Correlation id via `AsyncLocalStorage`: set once per request, available everywhere |
| [`logger.ts`](logger.ts) | JSON-lines logger that adds the correlation id and redacts every line |
| [`redact.ts`](redact.ts) | Masks secrets by key name and card numbers by pattern, at any depth |
| [`metrics.ts`](metrics.ts) | Per-provider call count, error rate, p50/p95 latency, error kinds, alerts |
| [`observe.ts`](observe.ts) | `observed()`: wrap any outbound call, get one log line and one metric |

## Run it

```bash
npm run part9
```

Simulates 300 checkouts, each calling a payments provider and a shipping provider.

```
1) One structured, redacted log line

  {
    "ts": "2026-11-25T03:00:00.165Z",
    "level": "info",
    "msg": "provider call ok",
    "correlationId": "req-0001",
    "provider": "payments",
    "operation": "charge",
    "request": {
      "headers": {
        "authorization": "****91ac"
      },
      "card": "****4242",
      "amount": 500
    },
    "durationMs": 165
  }

2) Per-provider metrics

  provider    calls   errors    p50       p95       failing how
  payments    300     1.0%      218 ms    289 ms    http_503 x3
  shipping    297     6.4%      332 ms    449 ms    timeout x14, http_503 x5

3) Alerts

  🚨 shipping: error rate 6.4% > 5%

4) 3 AM, "why did this checkout fail?" One filter on its correlation id:

  03:00:03.640  req-0008  info   checkout started
  03:00:03.844  req-0008  info   provider call ok  (payments charge 204 ms)
  03:00:08.844  req-0008  error  provider call failed  (shipping quote 5000 ms timeout)
  03:00:08.844  req-0008  warn   checkout failed
```

## Takeaways

1. **Log JSON, not sentences.** `provider=shipping errorKind=timeout` is a query; "Something went wrong" is not.
2. **One correlation id per request**, on every line, and forwarded to the provider in a header. Debugging becomes one filter.
3. **Redact before writing.** Logs get copied to dashboards, tickets and chats. Mask by key name *and* by pattern.
4. **Wrap every outbound call in one place**, so every call is logged and measured the same way.
5. **Measure per provider:** calls, error rate, latency percentiles, and *how* it fails (`timeout` vs `503` vs `429` need different fixes).
6. **Alert on error rate and p95, not averages.** An average hides the slow tail your users actually feel.
