import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const store = new AsyncLocalStorage<{ correlationId: string }>();

/**
 * Run `fn` with a correlation id that every log line inside it picks up automatically,
 * across awaits, without passing it through every function.
 * Reuse the caller's id (an incoming `x-correlation-id` header) when there is one.
 */
export function withCorrelation<T>(fn: () => T, correlationId: string = randomUUID()): T {
  return store.run({ correlationId }, fn);
}

export function correlationId(): string | undefined {
  return store.getStore()?.correlationId;
}

/** Headers to forward on outgoing calls, so the provider's logs can be matched to yours. */
export function correlationHeaders(): Record<string, string> {
  const id = correlationId();
  return id ? { 'x-correlation-id': id } : {};
}
