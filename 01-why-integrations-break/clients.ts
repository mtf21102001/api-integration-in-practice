export interface Order {
  id: string;
  status: string;
  total: number;
  currency: string;
}

/**
 * What most first integrations look like: call, parse, trust.
 * No timeout, no status check, no shape check.
 */
export async function getOrderNaive(baseUrl: string, id: string, mode = 'random'): Promise<Order> {
  const res = await fetch(`${baseUrl}/orders/${id}?mode=${mode}`);
  return (await res.json()) as Order;
}

export type FailureReason =
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'server_error'
  | 'http_error'
  | 'unexpected_shape';

export type OrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: FailureReason; detail: string; retryAfterSec?: number };

/**
 * Same call, written assuming the other side will misbehave.
 * It never throws: every failure comes back as a named reason the caller can act on.
 * (Retries, backoff and rate limiting get their own parts of the series.)
 */
export async function getOrder(
  baseUrl: string,
  id: string,
  opts: { mode?: string; timeoutMs?: number } = {},
): Promise<OrderResult> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const url = `${baseUrl}/orders/${id}?mode=${opts.mode ?? 'random'}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { ok: false, reason: 'timeout', detail: `no response after ${timeoutMs}ms` };
    }
    return { ok: false, reason: 'network', detail: String(err) };
  }

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('retry-after')) || undefined;
    return { ok: false, reason: 'rate_limited', detail: '429 Too Many Requests', retryAfterSec };
  }
  if (res.status >= 500) return { ok: false, reason: 'server_error', detail: `HTTP ${res.status}` };
  if (!res.ok) return { ok: false, reason: 'http_error', detail: `HTTP ${res.status}` };

  const body: unknown = await res.json().catch(() => null);
  if (!isOrder(body)) {
    return { ok: false, reason: 'unexpected_shape', detail: JSON.stringify(body)?.slice(0, 120) ?? 'empty body' };
  }
  return { ok: true, order: body };
}

function isOrder(value: unknown): value is Order {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.status === 'string' &&
    typeof o.total === 'number' &&
    typeof o.currency === 'string'
  );
}
