import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correlationHeaders, correlationId, withCorrelation } from './context.js';
import { createLogger, type LogLine } from './logger.js';
import { alerts, IntegrationMetrics, percentile } from './metrics.js';
import { observed, ProviderError } from './observe.js';
import { redact } from './redact.js';

test('redact masks sensitive keys at any depth and card numbers anywhere', () => {
  assert.deepEqual(
    redact({
      headers: { Authorization: 'Bearer abcdefgh1234', 'x-api-key': 'short' },
      payment: { cardNumber: '4111111111111111', amount: 10 },
      note: 'customer paid with 4111 1111 1111 1111 today',
      items: [{ password: 'hunter2' }],
    }),
    {
      headers: { Authorization: '****1234', 'x-api-key': '****' },
      payment: { cardNumber: '****1111', amount: 10 },
      note: 'customer paid with ****1111 today',
      items: [{ password: '****' }],
    },
  );
});

test('the correlation id follows async work without being passed around', async () => {
  assert.equal(correlationId(), undefined);
  const seen = await withCorrelation(async () => {
    await new Promise((r) => setTimeout(r, 1));
    return [correlationId(), correlationHeaders()];
  }, 'req-1');
  assert.deepEqual(seen, ['req-1', { 'x-correlation-id': 'req-1' }]);
});

test('observed() writes one log line and one metric per call, success or failure', async () => {
  const lines: LogLine[] = [];
  let clock = 0;
  const deps = { logger: createLogger((l) => lines.push(l)), metrics: new IntegrationMetrics(), now: () => clock };

  await withCorrelation(async () => {
    await observed(deps, { provider: 'p', operation: 'get' }, async () => {
      clock += 120;
      return 1;
    });
    await assert.rejects(
      observed(deps, { provider: 'p', operation: 'get' }, async () => {
        clock += 5000;
        throw new ProviderError('timeout');
      }),
    );
  }, 'req-9');

  assert.deepEqual(
    lines.map((l) => [l.level, l.correlationId, l.durationMs, l.errorKind]),
    [
      ['info', 'req-9', 120, undefined],
      ['error', 'req-9', 5000, 'timeout'],
    ],
  );
  assert.deepEqual(deps.metrics.summary(), [
    { provider: 'p', calls: 2, errorRate: 0.5, p50Ms: 120, p95Ms: 5000, errors: { timeout: 1 } },
  ]);
});

test('percentiles and alerts', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile([], 95), 0);
  assert.deepEqual(
    alerts([{ provider: 'x', calls: 10, errorRate: 0.2, p50Ms: 100, p95Ms: 3000, errors: {} }]),
    ['x: error rate 20.0% > 5%', 'x: p95 3000 ms > 2000 ms'],
  );
});
