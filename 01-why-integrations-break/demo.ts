import { getOrder, getOrderNaive } from './clients.js';
import { MODES, startFlakyApi } from './flaky-api.js';

const api = await startFlakyApi({ slowMs: 3000 });
const pad = (s: string) => s.padEnd(10);

console.log('\n1) Naive client: call, parse, trust\n');
for (const mode of MODES) {
  const started = Date.now();
  try {
    const order = await getOrderNaive(api.url, 'A-1001', mode);
    const took = Date.now() - started;
    console.log(`  ${pad(mode)} ✅ total = ${order.total.toFixed(2)} ${order.currency}  (${took}ms)`);
  } catch (err) {
    console.log(`  ${pad(mode)} 💥 ${(err as Error).message}`);
  }
}

console.log('\n2) Defensive client: assume they will misbehave\n');
for (const mode of MODES) {
  const result = await getOrder(api.url, 'A-1001', { mode, timeoutMs: 1000 });
  if (result.ok) {
    console.log(`  ${pad(mode)} ✅ total = ${result.order.total.toFixed(2)} ${result.order.currency}`);
  } else {
    const retry = result.retryAfterSec ? ` (retry after ${result.retryAfterSec}s)` : '';
    console.log(`  ${pad(mode)} ⚠️  ${result.reason}: ${result.detail}${retry}`);
  }
}

console.log(`
Notice:
  - The naive client crashes deep inside business code ("cannot read toFixed")
    for three different problems, and you can't tell them apart.
  - "slow" only worked because the server answered after 3s. In production
    there is no guarantee it answers at all.
  - The defensive client never throws. Every failure has a name you can log,
    alert on, or retry (coming in later parts).
`);

await api.close();
