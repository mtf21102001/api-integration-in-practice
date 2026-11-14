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
npm test        # all tests
```

No external services, no API keys: every example runs locally.

## 🗺️ Roadmap

| # | Topic | Code |
|---|---|---|
| 01 | [Why integrations break](01-why-integrations-break) | ✅ |
| 02 | [REST vs SOAP vs GraphQL: how each one fails](02-rest-soap-graphql) | ✅ |
| 03 | [Authentication: API keys, OAuth2 and request signing](03-authentication) | ✅ |
| 04 | One model for many APIs: canonical model and adapters | ⏳ Soon |
| 05 | Retries and exponential backoff | ⏳ Soon |
| 06 | Rate limiting without getting blocked | ⏳ Soon |
| 07 | Idempotency: never charge a customer twice | ⏳ Soon |
| 08 | Webhooks: signatures and duplicate deliveries | ⏳ Soon |
| 09 | Logging and observability for integrations | ⏳ Soon |
| 10 | Putting it all together in NestJS | ⏳ Soon |

## 🧰 Stack

TypeScript · Node.js (built-in `fetch`, `http`, `crypto` and `node:test`) · NestJS (part 10)

Dependencies are dev-only (`typescript`, `tsx`), so the patterns stay easy to read and copy.

## ⭐ Follow along

Star or watch the repo to get notified when a new part lands.

## License

[MIT](LICENSE)
