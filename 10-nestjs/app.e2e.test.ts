import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { signWebhook } from '../08-webhooks/webhooks.js';
import type { LogLine } from '../09-observability/logger.js';
import { createApp } from './create-app.js';
import { createFakeCarriers } from './fake-carriers.js';
import { SHIPMENT_STATE, type ShipmentState } from './tokens.js';

const secret = 'test-secret';
const logs: LogLine[] = [];
const carriers = createFakeCarriers();
let charges = 0;
let app: INestApplication;
let base: string;

before(async () => {
  app = await createApp({
    transport: carriers,
    webhookSecret: secret,
    logSink: (l) => logs.push(l),
    createCharge: async () => ({ id: `ch_${++charges}` }),
  });
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});
after(() => app.close());

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

test('shipments: canonical shape, retries through 503s, maps 404 and outages', async () => {
  const ok = await json('GET', '/shipments/parcelgo/7781');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {
    id: 'parcelgo:7781',
    provider: 'parcelgo',
    status: 'delivered',
    cost: { amountMinor: 9900, currency: 'USD' },
    updatedAt: '2026-11-21T10:15:00.000Z',
    warnings: [],
  });
  assert.equal(carriers.calls.parcelgo, 3); // two 503s, then success

  assert.equal((await json('GET', '/shipments/boxly/missing')).status, 404);
  assert.equal((await json('GET', '/shipments/nobody/1')).status, 404);
  assert.equal((await json('GET', '/shipments/swiftship/down')).status, 502);
});

test('charges: key required, retried request replays, payload change rejected', async () => {
  const order = { customerId: 'c1', amountMinor: 1000, currency: 'USD' };
  assert.equal((await json('POST', '/charges', order)).status, 400);

  const first = await json('POST', '/charges', order, { 'idempotency-key': 'k1' });
  const retry = await json('POST', '/charges', order, { 'idempotency-key': 'k1' });
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(retry.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(await retry.json(), await first.json());
  assert.equal(charges, 1);

  const changed = await json('POST', '/charges', { ...order, amountMinor: 5 }, { 'idempotency-key': 'k1' });
  assert.equal(changed.status, 422);
});

test('webhooks: raw-body signature, dedupe, state updated by the worker', async () => {
  const event = JSON.stringify({ id: 'evt_9', type: 'shipment.updated', data: { objectId: 'boxly:B-55', status: 'returned', version: 7 } });
  const now = Math.floor(Date.now() / 1000);
  const send = (sig: string) => json('POST', '/webhooks/carrier', event, { 'x-signature': sig });

  assert.equal((await send(signWebhook('wrong', event, now))).status, 401);
  assert.deepEqual(await (await send(signWebhook(secret, event, now))).json(), { received: true, outcome: 'queued' });
  assert.deepEqual(await (await send(signWebhook(secret, event, now))).json(), { received: true, outcome: 'duplicate' });

  await new Promise((r) => setTimeout(r, 20));
  const state = app.get<ShipmentState>(SHIPMENT_STATE);
  assert.deepEqual(state.get('boxly:B-55'), { status: 'returned', version: 7 });
});

test('correlation id: echoed back and stamped on every log line of the request', async () => {
  const res = await json('GET', '/shipments/swiftship/SS-1001', undefined, { 'x-correlation-id': 'corr-1' });
  assert.equal(res.headers.get('x-correlation-id'), 'corr-1');
  assert.ok(logs.some((l) => l.correlationId === 'corr-1' && l.msg === 'provider call ok'));

  const generated = await json('GET', '/shipments/swiftship/SS-1001');
  assert.match(generated.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/);
});

test('health: per-provider metrics', async () => {
  const stats = (await (await json('GET', '/health/integrations')).json()) as { provider: string; calls: number }[];
  assert.deepEqual(stats.map((s) => s.provider).sort(), ['boxly', 'parcelgo', 'swiftship']);
});
