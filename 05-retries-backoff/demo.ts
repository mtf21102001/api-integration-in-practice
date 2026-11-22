import { backoffDelay, HttpError, retry } from './retry.js';

/** A fake service that fails with the given errors first, then succeeds. */
function service(failures: Error[]) {
  let calls = 0;
  return {
    calls: () => calls,
    call: async () => {
      calls++;
      const failure = failures[calls - 1];
      if (failure) throw failure;
      return 'ok';
    },
  };
}

const fast = { baseDelayMs: 20, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms / 10)) };
const log = ({ attempt, delayMs, error }: { attempt: number; delayMs: number; error: unknown }) =>
  console.log(`    attempt ${attempt} failed (${(error as Error).message}) -> waiting ${delayMs} ms`);

async function scenario(title: string, failures: Error[]) {
  console.log(`\n  ${title}`);
  const s = service(failures);
  try {
    const result = await retry(s.call, { ...fast, onRetry: log });
    console.log(`    ✅ "${result}" after ${s.calls()} call(s)`);
  } catch (err) {
    console.log(`    ❌ gave up after ${s.calls()} call(s): ${(err as Error).message}`);
  }
}

console.log('\n1) Retry what can recover, stop on what cannot');
await scenario('503, 503, then OK', [new HttpError(503), new HttpError(503)]);
await scenario('400 Bad Request', [new HttpError(400)]);
await scenario('429 with Retry-After: 1s', [new HttpError(429, 1000)]);
await scenario('down for good', Array.from({ length: 10 }, () => new HttpError(503)));

// ---------------------------------------------------------------------------
console.log('\n2) Why jitter: 1,000 clients fail at the same moment and retry\n');

const clients = 1000;
const busiestWindow = (delays: number[], windowMs = 100) => {
  const buckets = new Map<number, number>();
  for (const d of delays) buckets.set(Math.floor(d / windowMs), (buckets.get(Math.floor(d / windowMs)) ?? 0) + 1);
  return Math.max(...buckets.values());
};

const noJitter = Array.from({ length: clients }, () => backoffDelay(3, 200, 10_000, () => 1));
const fullJitter = Array.from({ length: clients }, () => backoffDelay(3, 200, 10_000));
const bar = (n: number) => '█'.repeat(Math.ceil(n / 20));

console.log(`  fixed backoff  : busiest 100 ms gets ${String(busiestWindow(noJitter)).padStart(4)} requests ${bar(busiestWindow(noJitter))}`);
console.log(`  full jitter    : busiest 100 ms gets ${String(busiestWindow(fullJitter)).padStart(4)} requests ${bar(busiestWindow(fullJitter))}`);
console.log();
