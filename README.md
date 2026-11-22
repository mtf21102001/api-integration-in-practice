# API Integration in Practice 🔌

Practical patterns for integrating with third-party APIs, in **TypeScript** and **Node.js** (and **NestJS** for the final part).

Calling an endpoint is the easy part. The hard part is everything around it: the other side goes down, returns something the docs never mentioned, rate-limits you, or sends the same webhook twice. This repo collects the patterns for handling that, one small runnable example per topic.

It accompanies a post series on [LinkedIn](https://www.linkedin.com/in/mohammed-elfayoumy-66548222a). Each part gets a post and a folder here.

## 🚀 Quick start

Requires Node.js 20+.

```bash
git clone https://github.com/mtf21102001/api-integration-in-practice.git
cd api-integration-in-practice
npm install

npm run part1   # a flaky API vs a naive and a defensive client
npm run part2   # REST, SOAP and GraphQL errors -> one result type
npm run part3   # API keys, OAuth2 token refresh, HMAC signing
npm run part4   # three providers, one canonical model
npm run part5   # retries with exponential backoff and jitter
npm run part6   # a token bucket vs a rate-limited API
npm run part7   # idempotency keys: no double charges
npm run part8   # webhooks: signatures, duplicates, ordering
npm run part9   # structured logs, correlation ids, per-provider metrics
npm run part10  # all of it in one NestJS app
npm test        # all tests
```

No external services, no API keys: every example runs locally.

## 🗺️ Roadmap

| # | Topic | Code |
|---|---|---|
| 01 | [Why integrations break](01-why-integrations-break) | ✅ |
| 02 | [REST vs SOAP vs GraphQL: how each one fails](02-rest-soap-graphql) | ✅ |
| 03 | [Authentication: API keys, OAuth2 and request signing](03-authentication) | ✅ |
| 04 | [One model for many APIs: canonical model and adapters](04-canonical-model) | ✅ |
| 05 | [Retries and exponential backoff](05-retries-backoff) | ✅ |
| 06 | [Rate limiting without getting blocked](06-rate-limiting) | ✅ |
| 07 | [Idempotency: never charge a customer twice](07-idempotency) | ✅ |
| 08 | [Webhooks: signatures and duplicate deliveries](08-webhooks) | ✅ |
| 09 | [Logging and observability for integrations](09-observability) | ✅ |
| 10 | [Putting it all together in NestJS](10-nestjs) | ✅ |

## 🧰 Stack

TypeScript · Node.js (built-in `fetch`, `http`, `crypto` and `node:test`) · NestJS (part 10)

Parts 01–09 use only Node.js built-ins, so the patterns stay easy to read and copy. NestJS is used in part 10 only.

## ⭐ Found it useful?

A star helps other people find it.

## License

[MIT](LICENSE)
