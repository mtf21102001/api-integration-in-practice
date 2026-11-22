import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backoffDelay, HttpError, isRetryable, parseRetryAfter, retry } from './retry.js';

function harness() {
  let clock = 0;
  const waits: number[] = [];
  return {
    waits,
    opts: {
      now: () => clock,
      sleep: async (ms: number) => {
        waits.push(ms);
        clock += ms;
      },
      random: () => 1, // deterministic: always the top of the jitter range
    },
  };
}

test('retries transient failures and returns the eventual result', async () => {
  const { opts, waits } = harness();
  let calls = 0;
  const result = await retry(async () => {
    if (++calls < 3) throw new HttpError(503);
    return 'done';
  }, opts);
  assert.equal(result, 'done');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [200, 400]);
});

test('does not retry a 400', async () => {
  const { opts } = harness();
  let calls = 0;
  await assert.rejects(
    retry(async () => {
      calls++;
      throw new HttpError(400);
    }, opts),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});

test('honors Retry-After over its own backoff', async () => {
  const { opts, waits } = harness();
  let calls = 0;
  await retry(async () => {
    if (++calls === 1) throw new HttpError(429, 5000);
    return 'ok';
  }, opts);
  assert.deepEqual(waits, [5000]);
});

test('stops at maxAttempts and at the time budget', async () => {
  const h1 = harness();
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new HttpError(500);
  };
  await assert.rejects(retry(failing, { ...h1.opts, maxAttempts: 3 }));
  assert.equal(calls, 3);

  const h2 = harness();
  calls = 0;
  await assert.rejects(retry(failing, { ...h2.opts, maxAttempts: 100, budgetMs: 1000 }));
  assert.deepEqual(h2.waits, [200, 400]); // the next wait (800) would cross 1000 ms
});

test('backoff doubles, caps, and jitter stays in range', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map((n) => backoffDelay(n, 100, 1000, () => 1)), [100, 200, 400, 800, 1000]);
  for (let i = 0; i < 100; i++) {
    const d = backoffDelay(4, 100, 1000);
    assert.ok(d >= 0 && d < 800);
  }
});

test('classifies errors and parses Retry-After', () => {
  assert.equal(isRetryable(new HttpError(429)), true);
  assert.equal(isRetryable(new HttpError(404)), false);
  assert.equal(isRetryable(new TypeError('fetch failed')), true);
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter('Wed, 21 Oct 2026 07:28:30 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 30_000);
  assert.equal(parseRetryAfter('soon'), undefined);
});
