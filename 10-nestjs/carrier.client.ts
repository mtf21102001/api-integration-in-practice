import { BadGatewayException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { adapters, normalize } from '../04-canonical-model/adapters.js';
import type { Shipment } from '../04-canonical-model/shipment.js';
import { HttpError, retry } from '../05-retries-backoff/retry.js';
import type { TokenBucket } from '../06-rate-limiting/token-bucket.js';
import type { Logger } from '../09-observability/logger.js';
import type { IntegrationMetrics } from '../09-observability/metrics.js';
import { observed } from '../09-observability/observe.js';
import { LOGGER, METRICS, OPTIONS, RATE_LIMITER, type IntegrationOptions } from './tokens.js';

/**
 * Every pattern from the series, in the order a call goes through them:
 *   observe (09) -> retry with backoff (05) -> rate limit (06) -> call -> normalize (04)
 */
@Injectable()
export class CarrierClient {
  constructor(
    @Inject(OPTIONS) private readonly opts: IntegrationOptions,
    @Inject(RATE_LIMITER) private readonly bucket: TokenBucket,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: IntegrationMetrics,
  ) {}

  async getShipment(provider: string, shipmentId: string): Promise<Shipment> {
    if (!adapters[provider]) throw new NotFoundException(`Unknown carrier "${provider}"`);

    let raw: unknown;
    try {
      raw = await observed(
        { logger: this.logger, metrics: this.metrics, classify },
        { provider, operation: 'getShipment', request: { shipmentId } },
        () => retry(() => this.callOnce(provider, shipmentId), { maxAttempts: 3, baseDelayMs: 50 }),
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw new NotFoundException(`Shipment ${shipmentId} not found`);
      throw new BadGatewayException(`Carrier "${provider}" is unavailable`);
    }

    const result = normalize(provider, raw);
    if (!result.ok) {
      this.logger.error('carrier sent an unusable payload', { provider, error: result.error });
      throw new BadGatewayException(`Carrier "${provider}" sent an invalid response`);
    }
    if (result.shipment.warnings.length) this.logger.warn('carrier payload warnings', { provider, warnings: result.shipment.warnings });
    return result.shipment;
  }

  private async callOnce(provider: string, shipmentId: string): Promise<unknown> {
    await this.bucket.take();
    try {
      return await this.opts.transport(provider, shipmentId);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) this.bucket.pauseFor(err.retryAfterMs ?? 1000);
      throw err;
    }
  }
}

const classify = (err: unknown) =>
  err instanceof HttpError ? { kind: `http_${err.status}`, status: err.status } : { kind: 'network' };
