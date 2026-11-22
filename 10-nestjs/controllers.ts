import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { IdempotencyStore } from '../07-idempotency/idempotency.js';
import type { WebhookReceiver } from '../08-webhooks/webhooks.js';
import type { Logger } from '../09-observability/logger.js';
import type { IntegrationMetrics } from '../09-observability/metrics.js';
import { CarrierClient } from './carrier.client.js';
import { IDEMPOTENCY, LOGGER, METRICS, OPTIONS, WEBHOOKS, type IntegrationOptions } from './tokens.js';

@Controller('shipments')
export class ShipmentsController {
  constructor(@Inject(CarrierClient) private readonly carriers: CarrierClient) {}

  /** One endpoint, any carrier, always the same canonical shape. */
  @Get(':provider/:id')
  get(@Param('provider') provider: string, @Param('id') id: string) {
    return this.carriers.getShipment(provider, id);
  }
}

@Controller('charges')
export class ChargesController {
  constructor(
    @Inject(IDEMPOTENCY) private readonly idempotency: IdempotencyStore,
    @Inject(OPTIONS) private readonly opts: IntegrationOptions,
  ) {}

  /** Money moves here, so an Idempotency-Key is required, not optional. */
  @Post()
  async create(
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: { customerId?: string; amountMinor?: number; currency?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    const { customerId, amountMinor, currency } = body ?? {};
    if (!customerId || !Number.isInteger(amountMinor) || !currency) {
      throw new BadRequestException('customerId, integer amountMinor and currency are required');
    }
    const req = { customerId, amountMinor: amountMinor!, currency };
    const result = await this.idempotency.run(key, req, async () => {
      const charge = await (this.opts.createCharge ?? (async () => ({ id: `ch_${Date.now()}` })))(req);
      return { status: 201, body: { ...charge, ...req } };
    });
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(WEBHOOKS) private readonly receiver: WebhookReceiver,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Verify, dedupe, store, answer. The worker runs after the response is sent. */
  @Post('carrier')
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers('x-signature') signature: string | undefined, @Res({ passthrough: true }) res: Response) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const result = this.receiver.receive(rawBody, signature ?? '');
    res.status(result.status);
    if (result.outcome === 'queued') {
      setImmediate(() => void this.receiver.processPending().catch((err) => this.logger.error('webhook worker failed', { err: String(err) })));
    }
    return { received: result.status === 200, outcome: result.outcome };
  }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(METRICS) private readonly metrics: IntegrationMetrics) {}

  /** The numbers from part 09, one GET away. */
  @Get('integrations')
  integrations() {
    return this.metrics.summary();
  }
}
