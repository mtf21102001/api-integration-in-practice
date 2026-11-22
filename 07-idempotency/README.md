# 07 · Idempotency: never charge a customer twice

You send a payment request. The provider charges the card. The response never makes it back: a timeout, a dropped connection, a restarted pod. Your code sees an error and retries.

Now the customer has paid twice.

**Idempotency** means sending the same request twice has the same effect as sending it once. The standard tool is an `Idempotency-Key` header: the client generates a unique key per operation, and the server remembers what it answered for that key.

| File | What it does |
|---|---|
| [`idempotency.ts`](idempotency.ts) | `IdempotencyStore`: the server side of `Idempotency-Key` |
| [`payments.ts`](payments.ts) | A fake payment API and a client that reuses one key across retries |

## Run it

```bash
npm run part7
```

```
1) The charge succeeds, the response is lost, the client retries

  without Idempotency-Key -> 2 charge(s), customer paid 1000.00 EGP ❌
  with Idempotency-Key    -> 1 charge(s), customer paid 500.00 EGP ✅

2) What the server does with a repeated key

  first request              -> 201
  double click, same moment  -> 409 (still in progress)
  retry after it finished    -> 201 replayed=true
  same key, different amount -> 422 (key reused by mistake)

  The charge handler ran 1 time(s).
```

## Takeaways

1. **One key per logical operation**, generated once and reused on every retry. A new key per attempt defeats the point.
2. **Store the key before doing the work** (with a unique constraint), so a concurrent duplicate gets `409` instead of a second charge.
3. **Same key + same payload = replay the stored response.** Same key + different payload = `422`.
4. **If the work fails, release the key** so the retry can actually run.
5. **Expire keys** after a reasonable window (24 hours is common).
6. When the provider supports idempotency keys, **always send one** on anything that creates or moves money.
