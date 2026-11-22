import { Module, type DynamicModule, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TokenBucket } from '../06-rate-limiting/token-bucket.js';
import { IdempotencyStore } from '../07-idempotency/idempotency.js';
import { WebhookReceiver } from '../08-webhooks/webhooks.js';
import { correlationId, withCorrelation } from '../09-observability/context.js';
import { createLogger, type Logger } from '../09-observability/logger.js';
import { IntegrationMetrics } from '../09-observability/metrics.js';
import { CarrierClient } from './carrier.client.js';
import { ChargesController, HealthController, ShipmentsController, WebhooksController } from './controllers.js';
import {
  IDEMPOTENCY,
  LOGGER,
  METRICS,
  OPTIONS,
  RATE_LIMITER,
  SHIPMENT_STATE,
  WEBHOOKS,
  type IntegrationOptions,
  type ShipmentState,
} from './tokens.js';

/** Every request gets a correlation id (theirs, or a new one) that all its logs carry. */
function correlation(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-correlation-id');
  withCorrelation(() => {
    res.setHeader('x-correlation-id', correlationId()!);
    next();
  }, incoming || undefined);
}

@Module({})
export class AppModule implements NestModule {
  static forRoot(opts: IntegrationOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [ShipmentsController, ChargesController, WebhooksController, HealthController],
      providers: [
        { provide: OPTIONS, useValue: opts },
        { provide: LOGGER, useValue: createLogger(opts.logSink) },
        { provide: METRICS, useValue: new IntegrationMetrics() },
        // One bucket for the whole app: the limit belongs to the API key, not to a request.
        { provide: RATE_LIMITER, useValue: new TokenBucket({ capacity: 1, refillPerSec: opts.carrierRatePerSec ?? 9 }) },
        { provide: IDEMPOTENCY, useValue: new IdempotencyStore() },
        { provide: SHIPMENT_STATE, useValue: new Map() satisfies ShipmentState },
        {
          provide: WEBHOOKS,
          inject: [SHIPMENT_STATE, LOGGER],
          useFactory: (state: ShipmentState, logger: Logger) =>
            new WebhookReceiver({
              secret: opts.webhookSecret,
              handle: async (event) => {
                state.set(event.data.objectId, { status: event.data.status as never, version: event.data.version });
                logger.info('shipment updated from webhook', { eventId: event.id, ...event.data });
              },
            }),
        },
        CarrierClient,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlation).forRoutes('*path');
  }
}
