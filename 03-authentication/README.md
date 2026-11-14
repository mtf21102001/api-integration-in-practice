# 03 · Authentication that survives 3 AM

Logging in is easy. Staying logged in, at 3 AM, under load, with a clock that drifts, is the hard part.

| Method | What goes wrong | File |
|---|---|---|
| API key | It leaks: git, logs, error messages, frontend bundles | [`api-key.ts`](api-key.ts) |
| OAuth2 client credentials | Token expires mid-traffic; 50 requests refresh it 50 times | [`token-manager.ts`](token-manager.ts) |
| HMAC request signing | Re-serialized JSON breaks the signature; clock skew rejects requests | [`hmac.ts`](hmac.ts) |

## Run it

```bash
npm run part3
```

```
1) API key: load it once, never log it

  key in logs:       ****7b3d
  scrubbed error:    Request failed: GET /v1/charges?key=****7b3d returned 401
  missing key:       fails at startup -> "Missing required environment variable: MISSING_KEY"

2) OAuth2: 50 concurrent requests, one token refresh

  50 requests at once     -> 1 token request(s), all got "token-1"
  30 min later            -> 1 token request(s) (still cached)
  59m30s, 30s before expiry -> refreshed early: "token-2"

3) HMAC request signing: exact bytes, honest clocks

  raw body, as received      ✅ valid
  JSON.parse -> stringify    ❌ bad_signature
  amount tampered            ❌ bad_signature
  server clock 10 min off    ❌ stale_timestamp
```

## Takeaways

1. **API keys:** load from the environment, fail at startup if missing, and scrub them from anything you log.
2. **OAuth2:** cache the token, refresh it *before* it expires, and make concurrent callers share one refresh. On a `401`, invalidate and retry once.
3. **HMAC:** verify the raw request bytes before you parse them, include a timestamp in the signature, and keep server clocks in sync (NTP).
