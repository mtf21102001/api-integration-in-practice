import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signWebhook, verifyWebhook, WebhookReceiver, type ReceiverOptions } from './webhooks.js';

const secret = 's3cret';
const now = 1_000_000;
const body = (id: string, version: number, status = 'x') =>
  JSON.stringify({ id, type: 'order.updated', data: { objectId: 'o1', status, version } });

function setup(handle: ReceiverOptions['handle'] = async () => {}) {
  return new WebhookReceiver({ secret, handle, nowSec: () => now });
}

test('signature: valid, tampered, stale, malformed', () => {
  const b = body('e1', 1);
  assert.deepEqual(verifyWebhook(secret, b, signWebhook(secret, b, now), now), { ok: true });
  assert.deepEqual(verifyWebhook(secret, b + ' ', signWebhook(secret, b, now), now), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(verifyWebhook('other', b, signWebhook(secret, b, now), now), { ok: false, reason: 'bad_signature' });
  assert.deepEqual(verifyWebhook(secret, b, signWebhook(secret, b, now - 301), now), { ok: false, reason: 'stale_timestamp' });
  assert.deepEqual(verifyWebhook(secret, b, 'garbage', now), { ok: false, reason: 'malformed_header' });
});

test('duplicates are acknowledged but stored once', async () => {
  let calls = 0;
  const r = setup(async () => void calls++);
  const b = body('e1', 1);
  const outcomes = [1, 2, 3].map(() => r.receive(b, signWebhook(secret, b, now)).outcome);
  assert.deepEqual(outcomes, ['queued', 'duplicate', 'duplicate']);
  await r.processPending();
  assert.equal(calls, 1);
});

test('an older version arriving after a newer one is skipped', async () => {
  const seen: string[] = [];
  const r = setup(async (e) => void seen.push(e.data.status));
  const v2 = body('e2', 2, 'shipped');
  const v1 = body('e1', 1, 'paid');
  r.receive(v2, signWebhook(secret, v2, now));
  await r.processPending();
  r.receive(v1, signWebhook(secret, v1, now));
  const report = await r.processPending();
  assert.deepEqual(seen, ['shipped']);
  assert.deepEqual(report.skipped, ['e1']);
});

test('events waiting together are applied in version order', async () => {
  const seen: number[] = [];
  const r = setup(async (e) => void seen.push(e.data.version));
  for (const [id, v] of [['e3', 3], ['e1', 1], ['e2', 2]] as const) {
    const b = body(id, v);
    r.receive(b, signWebhook(secret, b, now));
  }
  await r.processPending();
  assert.deepEqual(seen, [1, 2, 3]);
});

test('a failing handler leaves the event in the inbox for the next run', async () => {
  let fail = true;
  const r = setup(async () => {
    if (fail) throw new Error('db down');
  });
  const b = body('e1', 1);
  r.receive(b, signWebhook(secret, b, now));
  assert.deepEqual((await r.processPending()).failed, ['e1']);
  fail = false;
  assert.deepEqual((await r.processPending()).applied, ['e1']);
  assert.equal(r.inbox.get('e1')?.attempts, 2);
});
