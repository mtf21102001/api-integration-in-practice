import { redact, requireEnv, scrub } from './api-key.js';
import { sign, verify } from './hmac.js';
import { TokenManager } from './token-manager.js';

// ---------------------------------------------------------------------------
console.log('\n1) API key: load it once, never log it\n');

const env = { PAYMENTS_API_KEY: 'demo-key-not-real-000000007b3d' };
const apiKey = requireEnv('PAYMENTS_API_KEY', env);
const errorMessage = `Request failed: GET /v1/charges?key=${apiKey} returned 401`;

console.log(`  key in logs:       ${redact(apiKey)}`);
console.log(`  scrubbed error:    ${scrub(errorMessage, [apiKey])}`);
try {
  requireEnv('MISSING_KEY', env);
} catch (err) {
  console.log(`  missing key:       fails at startup -> "${(err as Error).message}"`);
}

// ---------------------------------------------------------------------------
console.log('\n2) OAuth2: 50 concurrent requests, one token refresh\n');

let clock = 0;
let tokenRequests = 0;
const tokens = new TokenManager({
  now: () => clock,
  fetchToken: async () => {
    tokenRequests++;
    await new Promise((r) => setTimeout(r, 50)); // the token endpoint takes a moment
    return { value: `token-${tokenRequests}`, expiresAt: clock + 3600_000 }; // valid for 1 hour
  },
});

const burst = await Promise.all(Array.from({ length: 50 }, () => tokens.getToken()));
console.log(`  50 requests at once     -> ${tokenRequests} token request(s), all got "${burst[0]}"`);

clock += 30 * 60_000;
await tokens.getToken();
console.log(`  30 min later            -> ${tokenRequests} token request(s) (still cached)`);

clock += 29 * 60_000 + 30_000; // 59m30s: inside the 60s refresh window
console.log(`  59m30s, 30s before expiry -> refreshed early: "${await tokens.getToken()}"`);

// ---------------------------------------------------------------------------
console.log('\n3) HMAC request signing: exact bytes, honest clocks\n');

const secret = 'demo-shared-secret';
const rawBody = '{ "amount": 100, "currency": "USD" }'; // exactly what went over the wire
const timestamp = 1_800_000_000;
const signature = sign({ secret, method: 'POST', path: '/v1/payments', timestamp, rawBody });
const base = { secret, method: 'POST', path: '/v1/payments', timestamp, signature, nowSec: timestamp + 5 };

const results = {
  'raw body, as received': verify({ ...base, rawBody }),
  'JSON.parse -> stringify': verify({ ...base, rawBody: JSON.stringify(JSON.parse(rawBody)) }),
  'amount tampered': verify({ ...base, rawBody: rawBody.replace('100', '1000') }),
  'server clock 10 min off': verify({ ...base, rawBody, nowSec: timestamp + 600 }),
};
for (const [label, r] of Object.entries(results)) {
  console.log(`  ${label.padEnd(26)} ${r.ok ? '✅ valid' : `❌ ${r.reason}`}`);
}

console.log(`
Notice:
  - Re-serializing the same JSON broke the signature: verify the raw bytes, then parse.
  - The timestamp window is what stops someone replaying a captured request tomorrow.
`);
