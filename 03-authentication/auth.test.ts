import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redact, requireEnv, scrub } from './api-key.js';
import { sign, verify } from './hmac.js';
import { callWithToken, TokenManager } from './token-manager.js';

test('requireEnv throws on a missing or blank value', () => {
  assert.throws(() => requireEnv('X', {}), /Missing required environment variable: X/);
  assert.throws(() => requireEnv('X', { X: '  ' }));
  assert.equal(requireEnv('X', { X: 'abc' }), 'abc');
});

test('redact and scrub never show the full secret', () => {
  assert.equal(redact('demo-key-1234567890'), '****7890');
  assert.equal(redact('short'), '****');
  assert.equal(scrub('key=demo-key-1234567890 failed', ['demo-key-1234567890']), 'key=****7890 failed');
});

function fakeTokens(validMs = 3600_000) {
  let clock = 0;
  let calls = 0;
  const tm = new TokenManager({
    now: () => clock,
    fetchToken: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { value: `t${calls}`, expiresAt: clock + validMs };
    },
  });
  return { tm, calls: () => calls, advance: (ms: number) => (clock += ms) };
}

test('concurrent callers share a single refresh', async () => {
  const { tm, calls } = fakeTokens();
  const values = await Promise.all(Array.from({ length: 20 }, () => tm.getToken()));
  assert.equal(calls(), 1);
  assert.ok(values.every((v) => v === 't1'));
});

test('refreshes inside the early-refresh window, not before', async () => {
  const { tm, calls, advance } = fakeTokens();
  await tm.getToken();
  advance(3600_000 - 61_000);
  await tm.getToken();
  assert.equal(calls(), 1);
  advance(2_000);
  assert.equal(await tm.getToken(), 't2');
});

test('a 401 invalidates the token and retries once', async () => {
  const { tm, calls } = fakeTokens();
  const seen: string[] = [];
  const res = await callWithToken(tm, async (token) => {
    seen.push(token);
    return new Response(null, { status: token === 't1' ? 401 : 200 });
  });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, ['t1', 't2']);
  assert.equal(calls(), 2);
});

test('HMAC: valid, re-serialized, tampered, and stale', () => {
  const rawBody = '{ "a": 1 }';
  const input = { secret: 's', method: 'post', path: '/p', timestamp: 1000, rawBody };
  const signature = sign(input);
  assert.deepEqual(verify({ ...input, signature, nowSec: 1000 }), { ok: true });
  assert.deepEqual(verify({ ...input, rawBody: '{"a":1}', signature, nowSec: 1000 }), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(verify({ ...input, signature: 'zz', nowSec: 1000 }), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(verify({ ...input, signature, nowSec: 1000 + 301 }), { ok: false, reason: 'stale_timestamp' });
});
