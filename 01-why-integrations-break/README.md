# 01 · Why integrations break

The code you control is the easy part. The API on the other side can be slow, return a 500, change its response shape, or rate-limit you, and you can't fix any of it.

This part has two things:

- **[`flaky-api.ts`](flaky-api.ts)**: a small HTTP server that misbehaves on purpose, one mode per failure. Later parts reuse it.
- **[`clients.ts`](clients.ts)**: the same call written twice: a naive client (call, parse, trust) and a defensive one that never throws and names every failure.

## Run it

```bash
npm install
npm run part1
```

```
1) Naive client: call, parse, trust

  ok         ✅ total = 49.90 USD  (12ms)
  slow       ✅ total = 49.90 USD  (3008ms)
  error      💥 Cannot read properties of undefined (reading 'toFixed')
  shape      💥 Cannot read properties of undefined (reading 'toFixed')
  ratelimit  💥 Cannot read properties of undefined (reading 'toFixed')

2) Defensive client: assume they will misbehave

  ok         ✅ total = 49.90 USD
  slow       ⚠️  timeout: no response after 1000ms
  error      ⚠️  server_error: HTTP 500
  shape      ⚠️  unexpected_shape: {"data":{"orderId":"A-1001","state":"PAID","amount":"49.90"}}
  ratelimit  ⚠️  rate_limited: 429 Too Many Requests (retry after 30s)
```

Want to poke the API yourself?

```bash
npm run part1:server
curl -i "http://localhost:4000/orders/A-1001?mode=ratelimit"
```

## Takeaways

1. **Always set a timeout.** `fetch` has none by default. One slow dependency can hold every request you have open.
2. **Check the status before the body.** A 500 or 429 still has a JSON body, and it will happily flow into your business logic.
3. **Validate the shape you depend on.** A renamed field on their side shouldn't become `undefined` deep in your code.
4. **Name your failures.** `timeout`, `rate_limited` and `server_error` need different handling. A generic exception hides that.
