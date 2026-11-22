import { signWebhook, WebhookReceiver, type WebhookEvent } from './webhooks.js';

const secret = 'demo-webhook-secret';
const now = 1_795_000_000;

const orders: Record<string, string> = {};
let handled = 0;
const receiver = new WebhookReceiver({
  secret,
  nowSec: () => now,
  handle: async (e) => {
    handled++;
    orders[e.data.objectId] = e.data.status;
  },
});

const event = (id: string, status: string, version: number): string =>
  JSON.stringify({ id, type: 'order.updated', data: { objectId: 'ord_1', status, version } } satisfies WebhookEvent);

const paid = event('evt_1', 'paid', 1);
const shipped = event('evt_2', 'shipped', 2);

function deliver(label: string, body: string, header: string) {
  const r = receiver.receive(body, header);
  console.log(`  ${label.padEnd(30)} -> ${r.status} ${r.outcome}`);
}

async function runWorker() {
  const r = await receiver.processPending();
  const parts = [
    r.applied.length && `applied ${r.applied.join(', ')}`,
    r.skipped.length && `skipped ${r.skipped.join(', ')} (older than current state)`,
  ].filter(Boolean);
  console.log(`  [worker] ${parts.join('; ') || 'nothing to do'} -> order is "${orders.ord_1}"`);
}

console.log('\n1) Verify the signature before anything else\n');
deliver('forged body', paid.replace('paid', 'refunded'), signWebhook(secret, paid, now));
deliver('valid, but signed an hour ago', paid, signWebhook(secret, paid, now - 3600));

console.log('\n2) The same event, delivered three times\n');
deliver('"shipped" (v2)', shipped, signWebhook(secret, shipped, now));
deliver('"shipped" again', shipped, signWebhook(secret, shipped, now));
deliver('"shipped" again', shipped, signWebhook(secret, shipped, now));
await runWorker();

console.log('\n3) An older event arrives late\n');
deliver('"paid" (v1)', paid, signWebhook(secret, paid, now));
await runWorker();

console.log(`\n  4 deliveries accepted, business logic ran ${handled} time(s), final status "${orders.ord_1}" ✅\n`);
