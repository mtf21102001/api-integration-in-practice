import type { Logger } from './logger.js';
import type { IntegrationMetrics } from './metrics.js';

export class ProviderError extends Error {
  constructor(
    readonly kind: string,
    readonly status?: number,
  ) {
    super(kind);
    this.name = 'ProviderError';
  }
}

const classifyDefault = (err: unknown) =>
  err instanceof ProviderError ? { kind: err.kind, status: err.status } : { kind: 'unexpected' };

/**
 * Wrap every outbound call in one place, so every call gets the same log line and the same metrics.
 * One line per call, written when it finishes: what, to whom, how long, how it ended.
 */
export async function observed<T>(
  deps: {
    logger: Logger;
    metrics: IntegrationMetrics;
    now?: () => number;
    /** Map your error types to a short kind for metrics. Default understands ProviderError. */
    classify?: (err: unknown) => { kind: string; status?: number };
  },
  call: { provider: string; operation: string; request?: unknown },
  fn: () => Promise<T>,
): Promise<T> {
  const now = deps.now ?? (() => performance.now());
  const started = now();
  try {
    const result = await fn();
    const durationMs = Math.round(now() - started);
    deps.metrics.record({ provider: call.provider, operation: call.operation, durationMs, ok: true });
    deps.logger.info('provider call ok', { ...call, durationMs });
    return result;
  } catch (err) {
    const durationMs = Math.round(now() - started);
    const { kind: errorKind, status } = (deps.classify ?? classifyDefault)(err);
    deps.metrics.record({ provider: call.provider, operation: call.operation, durationMs, ok: false, errorKind });
    deps.logger.error('provider call failed', { ...call, durationMs, errorKind, status });
    throw err;
  }
}
