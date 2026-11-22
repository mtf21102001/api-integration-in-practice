import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLimitedApi } from './fake-api.js';
import { rateLimited, TokenBucket } from './token-bucket.js';

function fakeClock() {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

test('allows a burst up to capacity, then spaces requests by the refill rate', async () => {
  const clock = fakeClock();
  const bucket = new TokenBucket({ capacity: 3, refillPerSec: 2, ...clock });
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    await bucket.take();
    times.push(clock.now());
  }
  assert.deepEqual(times, [0, 0, 0, 500, 1000]);
});

test('concurrent callers are served in order, one token each', async () => {
  const clock = fakeClock();
  const bucket = new TokenBucket({ capacity: 1, refillPerSec: 10, ...clock });
  const order: number[] = [];
  await Promise.all([1, 2, 3, 4].map((n) => bucket.take().then(() => order.push(n))));
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.equal(clock.now(), 300);
});

test('pauseFor holds every caller until the pause is over', async () => {
  const clock = fakeClock();
  const bucket = new TokenBucket({ capacity: 5, refillPerSec: 5, ...clock });
  bucket.pauseFor(2000);
  await bucket.take();
  assert.ok(clock.now() >= 2000);
});

test('through the bucket, a limited API never says 429', async () => {
  const clock = fakeClock();
  const api = createLimitedApi(10, 1000, clock.now);
  const bucket = new TokenBucket({ capacity: 1, refillPerSec: 9, ...clock });
  const send = rateLimited(bucket, () => api.call());
  await Promise.all(Array.from({ length: 40 }, () => send()));
  assert.deepEqual(api.stats(), { ok: 40, rejected: 0 });
});

test('a 429 pauses the bucket for Retry-After', async () => {
  const clock = fakeClock();
  const bucket = new TokenBucket({ capacity: 10, refillPerSec: 10, ...clock });
  const send = rateLimited(bucket, async () => ({ status: 429, retryAfterMs: 3000 }));
  await send();
  await bucket.take();
  assert.equal(clock.now(), 3000);
});
