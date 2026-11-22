# 04 · One model for many APIs: canonical model and adapters

Connect to five providers and you get five field names for the same thing, five status vocabularies, five date formats and five ways to write a price. If those leak into your app, every new provider means touching every screen, report and job.

The fix: define **one model that belongs to you**, and write **one small adapter per provider** that translates into it. Nothing past the adapter knows which provider a record came from.

| File | What it does |
|---|---|
| [`shipment.ts`](shipment.ts) | The canonical `Shipment` model and the `Adapter` interface |
| [`adapters.ts`](adapters.ts) | Three adapters for three made-up carriers, plus `normalize()` |
| [`convert.ts`](convert.ts) | Shared helpers: money to minor units, currency codes, status mapping |
| [`fixtures.ts`](fixtures.ts) | What each carrier's payload looks like |

## The three payloads

| | swiftship | parcelgo | boxly |
|---|---|---|---|
| Shape | flat, snake_case | nested `data.shipment` | from XML, PascalCase |
| Id | `"SS-1001"` | `7781` (number) | `"B-55"` |
| Status | `IN_TRANSIT` | `4` | `"Delivered - signed by recipient"` |
| Price | `"125.5"` + `"egp"` | `{ cents: 9900 }` | `"40"` |
| Date | ISO with `+02:00` | Unix seconds | `20/11/2026 09:30` |

## Run it

```bash
npm run part4
```

```
Three carriers, three payload shapes, one Shipment model:

  ✅ swiftship:SS-1001  in_transit   125.50 EGP  2026-11-20T10:15:00.000Z
  ✅ parcelgo:7781      delivered    99.00 USD   2026-11-21T10:15:00.000Z
  ✅ boxly:B-55         delivered    40.00 EUR   2026-11-20T09:30:00.000Z
  ✅ swiftship:SS-1002  unknown      125.50 EGP  2026-11-20T10:15:00.000Z  ⚠️  unmapped status "HELD_AT_CUSTOMS"
  ❌ parcelgo: missing field "fee.cents"
  ❌ no adapter for provider "fastbox"
```

## Takeaways

1. **Own the model.** Design it around what your app needs, not around the first provider you integrated.
2. **Money in integer minor units**, parsed from the string. Never `parseFloat` a price.
3. **Dates in UTC ISO 8601.** Parse day-first formats by hand; `new Date()` will guess wrong.
4. **Prefix ids with the provider** so two providers' `1001` never collide.
5. **Unknown status = `unknown` + a warning.** Don't crash, and never guess "delivered".
6. **Fail loudly on missing required fields**, with the provider and field in the message.
7. Adding provider number six is one new file. Nothing else changes.
