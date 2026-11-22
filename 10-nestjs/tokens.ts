import type { Shipment } from '../04-canonical-model/shipment.js';
import type { LogLine } from '../09-observability/logger.js';

// Injection tokens. Every dependency is injected by token, so the example
// doesn't rely on emitDecoratorMetadata (which tsx/esbuild don't emit).
export const OPTIONS = Symbol('IntegrationOptions');
export const LOGGER = Symbol('Logger');
export const METRICS = Symbol('IntegrationMetrics');
export const RATE_LIMITER = Symbol('TokenBucket');
export const IDEMPOTENCY = Symbol('IdempotencyStore');
export const WEBHOOKS = Symbol('WebhookReceiver');
export const SHIPMENT_STATE = Symbol('ShipmentState');

/** How the app reaches a carrier. Real code would use fetch; tests and the demo pass a fake. */
export type CarrierTransport = (provider: string, shipmentId: string) => Promise<unknown>;

export interface IntegrationOptions {
  transport: CarrierTransport;
  webhookSecret: string;
  /** Carrier API limit we stay under, requests per second. */
  carrierRatePerSec?: number;
  logSink?: (line: LogLine) => void;
  /** Called for each payment that is actually created (not for replays). */
  createCharge?: (req: { customerId: string; amountMinor: number; currency: string }) => Promise<{ id: string }>;
}

/** Latest known status per shipment, fed by webhooks. A database table in real life. */
export type ShipmentState = Map<string, Pick<Shipment, 'status'> & { version: number }>;
