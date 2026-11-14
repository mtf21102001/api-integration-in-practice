import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getOrder, getOrderNaive } from './clients.js';
import { startFlakyApi, type FlakyApi } from './flaky-api.js';

let api: FlakyApi;
before(async () => {
  api = await startFlakyApi({ slowMs: 500 });
});
after(() => api.close());

test('ok: returns the order', async () => {
  const r = await getOrder(api.url, 'A-1', { mode: 'ok' });
  assert.deepEqual(r, { ok: true, order: { id: 'A-1', status: 'paid', total: 49.9, currency: 'USD' } });
});

test('slow: gives up after the timeout instead of hanging', async () => {
  const r = await getOrder(api.url, 'A-1', { mode: 'slow', timeoutMs: 100 });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'timeout');
});

test('error: reports a server error', async () => {
  const r = await getOrder(api.url, 'A-1', { mode: 'error' });
  assert.equal(!r.ok && r.reason, 'server_error');
});

test('shape: catches a changed response shape', async () => {
  const r = await getOrder(api.url, 'A-1', { mode: 'shape' });
  assert.equal(!r.ok && r.reason, 'unexpected_shape');
});

test('ratelimit: reports 429 with Retry-After', async () => {
  const r = await getOrder(api.url, 'A-1', { mode: 'ratelimit' });
  assert.equal(!r.ok && r.reason, 'rate_limited');
  assert.equal(!r.ok && r.retryAfterSec, 30);
});

test('naive client: a 500 sneaks through as an "order"', async () => {
  const order = await getOrderNaive(api.url, 'A-1', 'error');
  assert.equal(order.total, undefined);
});
