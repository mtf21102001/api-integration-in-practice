import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, IdempotencyStore } from './idempotency.js';
import { chargeWithRetry, createPaymentApi } from './payments.js';

const order = { customerId: 'c1', amountMinor: 1000, currency: 'USD' };

test('a lost response plus a retry charges twice without a key, once with one', async () => {
  const bare = createPaymentApi({ useKeys: false });
  await chargeWithRetry(bare, order, { dropFirstResponse: true });
  assert.equal(bare.charges.length, 2);

  const safe = createPaymentApi({ useKeys: true });
  const res = await chargeWithRetry(safe, order, { dropFirstResponse: true });
  assert.equal(safe.charges.length, 1);
  assert.equal(res.replayed, true);
  assert.deepEqual(res.body, safe.charges[0]);
});

test('same key: replay; concurrent: 409; different payload: 422', async () => {
  const store = new IdempotencyStore();
  let runs = 0;
  const handler = async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 5));
    return { status: 201, body: { n: runs } };
  };
  const [a, b] = await Promise.all([store.run('k', order, handler), store.run('k', order, handler)]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 409);
  assert.deepEqual(await store.run('k', order, handler), { status: 201, body: { n: 1 }, replayed: true });
  assert.equal((await store.run('k', { ...order, amountMinor: 2 }, handler)).status, 422);
  assert.equal(runs, 1);
});

test('a failed handler releases the key so a retry can run', async () => {
  const store = new IdempotencyStore();
  await assert.rejects(store.run('k', order, async () => Promise.reject(new Error('bank down'))));
  const res = await store.run('k', order, async () => ({ status: 201, body: 'ok' }));
  assert.deepEqual(res, { status: 201, body: 'ok', replayed: false });
});

test('keys expire after the TTL', async () => {
  let clock = 0;
  const store = new IdempotencyStore(1000, () => clock);
  let runs = 0;
  const handler = async () => ({ status: 201, body: ++runs });
  await store.run('k', order, handler);
  clock = 1001;
  await store.run('k', order, handler);
  assert.equal(runs, 2);
});

test('fingerprint ignores key order', () => {
  assert.equal(fingerprint({ a: 1, b: { c: 2, d: 3 } }), fingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});
