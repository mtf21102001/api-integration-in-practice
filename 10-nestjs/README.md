# 10 · Putting it all together in NestJS

Nine parts, nine patterns. This part wires them into one NestJS app, using the code from the earlier folders as-is.

## What's inside

| Endpoint | Patterns used |
|---|---|
| `GET /shipments/:provider/:id` | observe (09) → retry with backoff (05) → rate limit (06) → call → normalize to the canonical model (04) |
| `POST /charges` | required `Idempotency-Key` (07) |
| `POST /webhooks/carrier` | raw-body signature, dedupe, inbox + worker (08) |
| `GET /health/integrations` | per-provider metrics (09) |
| every request | `x-correlation-id` in, out, and on every log line (09) |

| File | What it does |
|---|---|
| [`app.module.ts`](app.module.ts) | `AppModule.forRoot(options)`: providers, controllers, correlation middleware |
| [`carrier.client.ts`](carrier.client.ts) | The outbound client: every pattern, in order |
| [`controllers.ts`](controllers.ts) | Shipments, charges, webhooks and health controllers |
| [`tokens.ts`](tokens.ts) | Injection tokens and options |
| [`create-app.ts`](create-app.ts) / [`server.ts`](server.ts) | Bootstrap (with `rawBody: true` for webhook signatures) |
| [`fake-carriers.ts`](fake-carriers.ts) | In-memory carriers, so it runs with no network or accounts |
| [`app.e2e.test.ts`](app.e2e.test.ts) | End-to-end tests over real HTTP |

## Run it

```bash
npm run part10          # scripted tour of every endpoint
npm run part10:server   # or run the server on :3000 and try it yourself
```

```
1) GET /shipments/:provider/:id   three carriers, one shape

  /shipments/swiftship/SS-1001   -> 200 swiftship:SS-1001 in_transit 12550 EGP
  /shipments/parcelgo/7781       -> 200 parcelgo:7781 delivered 9900 USD
  /shipments/boxly/B-55          -> 200 boxly:B-55 delivered 4000 EUR
  /shipments/boxly/missing       -> 404 Shipment missing not found
  /shipments/swiftship/down      -> 502 Carrier "swiftship" is unavailable

2) POST /charges   with an Idempotency-Key

  no key                 -> 400 Idempotency-Key header is required
  key abc                -> 201 ch_1
  key abc again (retry)  -> 201 replayed ch_1
  charges actually created: 1

3) POST /webhooks/carrier   signed, deduped

  valid                  -> 200 queued
  same event again       -> 200 duplicate
  wrong secret           -> 401 bad_signature

4) GET /health/integrations

  swiftship  calls=2 errorRate=50% errors={"http_503":1}
  parcelgo   calls=1 errorRate=0% errors={}
  boxly      calls=2 errorRate=50% errors={"http_404":1}
```

`parcelgo` fails twice with `503` before answering. The caller never notices: the retry absorbs it.

## Notes

- **Everything is injected by token** (`@Inject(LOGGER)`), so the example runs under `tsx`, which doesn't emit decorator metadata. In a regular Nest CLI project you can inject by class type.
- **The in-memory stores** (idempotency keys, webhook inbox, rate-limit bucket) become database tables or Redis once you run more than one instance.
- **Error mapping:** provider `404` → your `404`; provider outage → your `502`. Never pass a provider's raw error through to your own clients.

## Takeaways

1. **One client per integration, one place for the patterns.** Controllers never call `fetch` directly.
2. **The order matters:** measure the whole call, retry around the rate limiter, normalize once at the end.
3. **The limit, the idempotency store and the inbox are shared state.** Treat them like it.
4. **Test over HTTP.** The e2e tests catch what unit tests miss: raw bodies, headers, status codes.
