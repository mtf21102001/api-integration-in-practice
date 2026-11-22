import { signWebhook } from '../08-webhooks/webhooks.js';
import type { LogLine } from '../09-observability/logger.js';
import { createApp } from './create-app.js';
import { createFakeCarriers } from './fake-carriers.js';

const secret = 'demo-webhook-secret';
const logs: LogLine[] = [];
let charges = 0;

const app = await createApp({
  transport: createFakeCarriers(),
  webhookSecret: secret,
  logSink: (l) => logs.push(l),
  createCharge: async () => ({ id: `ch_${++charges}` }),
});
await app.listen(0);
const base = (await app.getUrl()).replace('[::1]', 'localhost');

async function call(method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body,
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}

console.log('\n1) GET /shipments/:provider/:id   three carriers, one shape\n');
for (const path of ['/shipments/swiftship/SS-1001', '/shipments/parcelgo/7781', '/shipments/boxly/B-55', '/shipments/boxly/missing', '/shipments/swiftship/down']) {
  const r = await call('GET', path);
  const summary = r.status === 200 ? `${r.body.id} ${r.body.status} ${r.body.cost.amountMinor} ${r.body.cost.currency}` : r.body.message;
  console.log(`  ${path.padEnd(30)} -> ${r.status} ${summary}`);
}

console.log('\n2) POST /charges   with an Idempotency-Key\n');
const order = JSON.stringify({ customerId: 'cus_42', amountMinor: 50000, currency: 'EGP' });
for (const [label, headers] of [
  ['no key', {}],
  ['key abc', { 'idempotency-key': 'abc' }],
  ['key abc again (retry)', { 'idempotency-key': 'abc' }],
] as const) {
  const r = await call('POST', '/charges', { body: order, headers });
  const replayed = r.headers.get('idempotent-replayed') ? ' replayed' : '';
  console.log(`  ${label.padEnd(22)} -> ${r.status}${replayed} ${r.body.id ?? r.body.message}`);
}
console.log(`  charges actually created: ${charges}`);

console.log('\n3) POST /webhooks/carrier   signed, deduped\n');
const event = JSON.stringify({ id: 'evt_1', type: 'shipment.updated', data: { objectId: 'boxly:B-55', status: 'delivered', version: 3 } });
const now = Math.floor(Date.now() / 1000);
for (const [label, sig] of [
  ['valid', signWebhook(secret, event, now)],
  ['same event again', signWebhook(secret, event, now)],
  ['wrong secret', signWebhook('guess', event, now)],
] as const) {
  const r = await call('POST', '/webhooks/carrier', { body: event, headers: { 'x-signature': sig } });
  console.log(`  ${label.padEnd(22)} -> ${r.status} ${r.body.outcome}`);
}

await new Promise((r) => setTimeout(r, 20)); // let the webhook worker run

console.log('\n4) GET /health/integrations\n');
for (const s of (await call('GET', '/health/integrations')).body) {
  console.log(`  ${s.provider.padEnd(10)} calls=${s.calls} errorRate=${(s.errorRate * 100).toFixed(0)}% errors=${JSON.stringify(s.errors)}`);
}

console.log('\n5) Logs for one request, found by its x-correlation-id\n');
const traced = await call('GET', '/shipments/parcelgo/7781', { headers: { 'x-correlation-id': 'trace-me' } });
console.log(`  response header x-correlation-id: ${traced.headers.get('x-correlation-id')}`);
for (const l of logs.filter((x) => x.correlationId === 'trace-me')) {
  console.log(`  ${l.level.padEnd(5)} ${l.msg} ${JSON.stringify({ provider: l.provider, durationMs: l.durationMs })}`);
}

await app.close();
console.log();
