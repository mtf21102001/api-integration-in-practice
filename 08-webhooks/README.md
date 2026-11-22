# 08 · Webhooks: signatures, duplicates and out-of-order events

With webhooks, the other side calls you. That flips the problems around:

- **Anyone** can POST to your webhook URL.
- Providers deliver **at least once**, so the same event will arrive more than once.
- Events arrive **in any order**: "shipped" can land before "paid".
- If you're slow to answer, the provider times out and **sends it again**.

| File | What it does |
|---|---|
| [`webhooks.ts`](webhooks.ts) | `signWebhook` / `verifyWebhook`, and a `WebhookReceiver` with an inbox and a worker |

## The design

```
provider ──POST──> receive()                         processPending()  (worker)
                   1. verify signature + timestamp   1. take pending events, oldest version first
                   2. seen this event id? -> 200     2. older than current state? skip
                   3. store in inbox                 3. apply; on failure, keep for next run
                   4. 200, in milliseconds
```

## Run it

```bash
npm run part8
```

```
1) Verify the signature before anything else

  forged body                    -> 401 bad_signature
  valid, but signed an hour ago  -> 401 stale_timestamp

2) The same event, delivered three times

  "shipped" (v2)                 -> 200 queued
  "shipped" again                -> 200 duplicate
  "shipped" again                -> 200 duplicate
  [worker] applied evt_2 -> order is "shipped"

3) An older event arrives late

  "paid" (v1)                    -> 200 queued
  [worker] skipped evt_1 (older than current state) -> order is "shipped"

  4 deliveries accepted, business logic ran 1 time(s), final status "shipped" ✅
```

## Takeaways

1. **Verify the signature over the raw body**, before parsing, with a timing-safe compare and a timestamp window.
2. **Dedupe by event id** with a unique index. Answer `200` to duplicates, or the provider keeps sending them.
3. **Acknowledge fast, process later.** Store the event and return; do the real work in a worker.
4. **Don't trust arrival order.** Compare a version or timestamp with what you already have, and skip older events.
5. **Keep failed events** and retry them. A webhook you lost is data you'll never see again.
6. Webhooks get missed anyway. **Reconcile** periodically by fetching the current state from the API.
