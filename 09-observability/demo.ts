import { withCorrelation } from './context.js';
import { createLogger, type LogLine } from './logger.js';
import { alerts, IntegrationMetrics } from './metrics.js';
import { observed, ProviderError } from './observe.js';

// A deterministic "random", so the demo prints the same story every time.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);

// Simulated clock: fake providers "take time" by moving it forward.
let clock = 0;
const lines: LogLine[] = [];
const logger = createLogger((l) => lines.push(l), () => new Date(Date.UTC(2026, 10, 25, 3, 0, 0) + clock));
const metrics = new IntegrationMetrics();
const deps = { logger, metrics, now: () => clock };

const payments = async () => {
  clock += 120 + Math.floor(rand() * 180);
  if (rand() < 0.01) throw new ProviderError('http_503', 503);
  return { chargeId: 'ch_1' };
};
const shipping = async () => {
  const r = rand();
  if (r < 0.07) {
    clock += 5000;
    throw new ProviderError('timeout');
  }
  clock += 200 + Math.floor(rand() * 250);
  if (r < 0.1) throw new ProviderError('http_503', 503);
  return { quote: 85 };
};

for (let n = 1; n <= 300; n++) {
  await withCorrelation(async () => {
    logger.info('checkout started', { orderId: `ord_${n}` });
    try {
      await observed(
        deps,
        {
          provider: 'payments',
          operation: 'charge',
          request: { headers: { authorization: 'Bearer demo-token-not-real-91ac' }, card: '4242 4242 4242 4242', amount: 500 },
        },
        payments,
      );
      await observed(deps, { provider: 'shipping', operation: 'quote' }, shipping);
      logger.info('checkout completed');
    } catch {
      logger.warn('checkout failed');
    }
  }, `req-${String(n).padStart(4, '0')}`);
}

// ---------------------------------------------------------------------------
console.log('\n1) One structured, redacted log line\n');
const sample = lines.find((l) => l.provider === 'payments')!;
console.log('  ' + JSON.stringify(sample, null, 2).replaceAll('\n', '\n  '));

console.log('\n2) Per-provider metrics\n');
console.log('  provider    calls   errors    p50       p95       failing how');
for (const s of metrics.summary()) {
  const how = Object.entries(s.errors).map(([k, v]) => `${k} x${v}`).join(', ') || '-';
  console.log(
    `  ${s.provider.padEnd(10)}  ${String(s.calls).padEnd(6)}  ${`${(s.errorRate * 100).toFixed(1)}%`.padEnd(8)}  ${`${s.p50Ms} ms`.padEnd(8)}  ${`${s.p95Ms} ms`.padEnd(8)}  ${how}`,
  );
}

console.log('\n3) Alerts\n');
for (const a of alerts(metrics.summary())) console.log(`  🚨 ${a}`);

console.log('\n4) 3 AM, "why did this checkout fail?" One filter on its correlation id:\n');
const failed = lines.find((l) => l.msg === 'checkout failed')!;
for (const l of lines.filter((x) => x.correlationId === failed.correlationId)) {
  const extra = [l.provider, l.operation, l.durationMs !== undefined && `${l.durationMs} ms`, l.errorKind]
    .filter(Boolean)
    .join(' ');
  console.log(`  ${l.ts.slice(11, 23)}  ${l.correlationId}  ${l.level.padEnd(5)}  ${l.msg}${extra ? `  (${extra})` : ''}`);
}
console.log();
