import { randomUUID } from 'node:crypto';
import { IdempotencyStore, type IdempotentResult } from './idempotency.js';

export interface ChargeRequest {
  customerId: string;
  amountMinor: number;
  currency: string;
}

/** A fake payment provider. `useKeys: false` behaves like an API with no idempotency support. */
export function createPaymentApi({ useKeys }: { useKeys: boolean }) {
  const charges: (ChargeRequest & { id: string })[] = [];
  const store = new IdempotencyStore();

  const charge = async (req: ChargeRequest) => {
    await new Promise((r) => setTimeout(r, 20)); // talking to the bank
    const created = { id: `ch_${charges.length + 1}`, ...req };
    charges.push(created);
    return { status: 201, body: created };
  };

  return {
    charges,
    async post(req: ChargeRequest, idempotencyKey?: string): Promise<IdempotentResult> {
      if (useKeys && idempotencyKey) return store.run(idempotencyKey, req, () => charge(req));
      return { ...(await charge(req)), replayed: false };
    },
  };
}

type PaymentApi = ReturnType<typeof createPaymentApi>;

/**
 * Client side: one key per *logical* operation, created once and reused on every retry.
 * A new key per attempt would defeat the whole point.
 */
export async function chargeWithRetry(
  api: PaymentApi,
  req: ChargeRequest,
  opts: { attempts?: number; dropFirstResponse?: boolean; key?: string } = {},
): Promise<IdempotentResult> {
  const key = opts.key ?? randomUUID();
  let dropNext = opts.dropFirstResponse ?? false;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await api.post(req, key);
      if (dropNext) {
        // The charge went through, but the response died on the way back (timeout, dropped connection).
        dropNext = false;
        throw new Error('socket hang up');
      }
      return res;
    } catch (err) {
      if (attempt >= (opts.attempts ?? 3)) throw err;
    }
  }
}
