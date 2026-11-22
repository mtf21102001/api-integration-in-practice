import { IdempotencyStore } from './idempotency.js';
import { chargeWithRetry, createPaymentApi } from './payments.js';

const order = { customerId: 'cus_42', amountMinor: 50_000, currency: 'EGP' };
const total = (charges: { amountMinor: number }[]) => (charges.reduce((s, c) => s + c.amountMinor, 0) / 100).toFixed(2);

console.log('\n1) The charge succeeds, the response is lost, the client retries\n');

for (const useKeys of [false, true]) {
  const api = createPaymentApi({ useKeys });
  await chargeWithRetry(api, order, { dropFirstResponse: true });
  const label = useKeys ? 'with Idempotency-Key   ' : 'without Idempotency-Key';
  const mark = api.charges.length === 1 ? '✅' : '❌';
  console.log(`  ${label} -> ${api.charges.length} charge(s), customer paid ${total(api.charges)} EGP ${mark}`);
}

// ---------------------------------------------------------------------------
console.log('\n2) What the server does with a repeated key\n');

const store = new IdempotencyStore();
let runs = 0;
const handler = async () => {
  runs++;
  await new Promise((r) => setTimeout(r, 20));
  return { status: 201, body: { id: 'ch_1' } };
};

const [first, doubleClick] = await Promise.all([
  store.run('key-1', order, handler),
  store.run('key-1', order, handler),
]);
const retry = await store.run('key-1', order, handler);
const misuse = await store.run('key-1', { ...order, amountMinor: 1 }, handler);

console.log(`  first request              -> ${first.status}`);
console.log(`  double click, same moment  -> ${doubleClick.status} (still in progress)`);
console.log(`  retry after it finished    -> ${retry.status} replayed=${retry.replayed}`);
console.log(`  same key, different amount -> ${misuse.status} (key reused by mistake)`);
console.log(`\n  The charge handler ran ${runs} time(s).\n`);
