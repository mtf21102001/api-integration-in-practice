export interface CallRecord {
  provider: string;
  operation: string;
  durationMs: number;
  ok: boolean;
  /** 'timeout', 'http_503', 'rate_limited'... whatever your error taxonomy is. */
  errorKind?: string;
}

export interface ProviderStats {
  provider: string;
  calls: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  errors: Record<string, number>;
}

/**
 * In-memory metrics per provider. In production these become Prometheus/OpenTelemetry
 * counters and histograms, but the questions are the same:
 * how many calls, how many failed, how slow, and failing how.
 */
export class IntegrationMetrics {
  private records: CallRecord[] = [];

  record(r: CallRecord): void {
    this.records.push(r);
  }

  summary(): ProviderStats[] {
    const byProvider = new Map<string, CallRecord[]>();
    for (const r of this.records) byProvider.set(r.provider, [...(byProvider.get(r.provider) ?? []), r]);
    return [...byProvider].map(([provider, rs]) => {
      const durations = rs.map((r) => r.durationMs).sort((a, b) => a - b);
      const failed = rs.filter((r) => !r.ok);
      const errors: Record<string, number> = {};
      for (const r of failed) errors[r.errorKind ?? 'unknown'] = (errors[r.errorKind ?? 'unknown'] ?? 0) + 1;
      return {
        provider,
        calls: rs.length,
        errorRate: failed.length / rs.length,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        errors,
      };
    });
  }
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/** Turn numbers into alerts. An average hides the slow tail; alert on p95 and error rate. */
export function alerts(stats: ProviderStats[], limits = { maxErrorRate: 0.05, maxP95Ms: 2000 }): string[] {
  return stats.flatMap((s) => [
    ...(s.errorRate > limits.maxErrorRate
      ? [`${s.provider}: error rate ${(s.errorRate * 100).toFixed(1)}% > ${limits.maxErrorRate * 100}%`]
      : []),
    ...(s.p95Ms > limits.maxP95Ms ? [`${s.provider}: p95 ${s.p95Ms} ms > ${limits.maxP95Ms} ms`] : []),
  ]);
}
