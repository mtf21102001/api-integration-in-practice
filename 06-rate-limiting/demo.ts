import { createLimitedApi } from './fake-api.js';
import { rateLimited, TokenBucket } from './token-bucket.js';

const LIMIT = 10; // the API allows 10 requests per second
const REQUESTS = 30;

console.log(`\nThe API allows ${LIMIT} requests/second. We need to send ${REQUESTS}.\n`);

// 1) Fire everything at once.
{
  const api = createLimitedApi(LIMIT);
  await Promise.all(Array.from({ length: REQUESTS }, () => api.call()));
  const { ok, rejected } = api.stats();
  console.log(`  1) Promise.all, no limiter      -> ${String(ok).padStart(2)} OK, ${String(rejected).padStart(2)} x 429 ❌`);
}

// 2) Go through a token bucket set a little under the limit.
{
  const api = createLimitedApi(LIMIT);
  const bucket = new TokenBucket({ capacity: 1, refillPerSec: LIMIT - 1 });
  const send = rateLimited(bucket, () => api.call());
  const started = Date.now();
  await Promise.all(Array.from({ length: REQUESTS }, () => send()));
  const { ok, rejected } = api.stats();
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  2) token bucket (${LIMIT - 1}/s)           -> ${String(ok).padStart(2)} OK, ${String(rejected).padStart(2)} x 429 ✅ in ${secs}s`);
}

console.log(`
  Slower on paper, faster in practice: every 429 is a request you have to
  send again, and enough of them can get your key throttled or blocked.
`);
