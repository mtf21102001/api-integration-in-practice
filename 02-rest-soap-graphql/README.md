# 02 · REST, SOAP or GraphQL

**`200 OK` doesn't mean success.**

You'll meet all three styles, and each one reports failure differently:

| Style | How it fails | Gotcha |
|---|---|---|
| REST | HTTP status codes, or `200` with `"success": false` | Every provider invents its own error format |
| SOAP | A `<Fault>` inside the envelope, usually with `500` | SOAP 1.1 and 1.2 name the fault fields differently |
| GraphQL | An `errors` array, usually with `200` | You can get `data` and `errors` in the same response |

This part turns all three into one result type, so the rest of your code never cares which protocol it was:

```ts
type IntegrationResult<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: { kind; status; code?; message; retryable } };
```

- [`rest.ts`](rest.ts): status codes and "200 but failed" bodies
- [`soap.ts`](soap.ts): SOAP 1.1 and 1.2 faults
- [`graphql.ts`](graphql.ts): errors, and partial data with warnings
- [`fixtures.ts`](fixtures.ts): realistic sample responses

## Run it

```bash
npm run part2
```

```
REST
  ok                     HTTP 200  ✅ ok
  notFound               HTTP 404  ❌ http: customer not found  (retryable: false)
  okButFailed            HTTP 200  ❌ business [INSUFFICIENT_BALANCE]: Not enough balance  (retryable: false)
  serverError            HTTP 503  ❌ http: Service Unavailable  (retryable: true)

SOAP
  ok                     HTTP 200  ✅ ok
  clientFault            HTTP 500  ❌ soap_fault [soap:Client]: Invalid account number  (retryable: false)
  serverFault12          HTTP 500  ❌ soap_fault [env:Receiver]: Backend timeout  (retryable: true)

GraphQL
  ok                     HTTP 200  ✅ ok
  errorWith200           HTTP 200  ❌ graphql [FORBIDDEN]: customer: Not authorized  (retryable: false)
  partial                HTTP 200  ✅ ok   ⚠️  partial: customer.invoices: Invoices service timed out
```

## Takeaways

1. **Read how an API reports errors before you read how it returns data.**
2. **Decide `retryable` at the edge.** A 503 or a SOAP `Receiver` fault may pass; a `404` or "insufficient balance" never will.
3. **Don't drop partial GraphQL data.** Keep what came back and log what didn't.
4. **For SOAP in production, generate a client from the WSDL** and use a real XML parser. The regex here is for teaching.
