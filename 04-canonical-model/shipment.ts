/**
 * The canonical model: the one shape the rest of your app knows about.
 * No provider's field names, status codes or date formats leak past the adapters.
 */
export type ShipmentStatus =
  | 'created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned'
  | 'unknown'; // a status we have never seen: flag it, never guess

export interface Money {
  /** Integer minor units (cents, piasters). Floats and money don't mix. */
  amountMinor: number;
  /** ISO 4217, upper case. */
  currency: string;
}

export interface Shipment {
  /** `<provider>:<their id>`, so ids from different providers can never collide. */
  id: string;
  provider: string;
  status: ShipmentStatus;
  cost: Money;
  /** ISO 8601 in UTC. */
  updatedAt: string;
  /** Things the adapter tolerated but you should know about. */
  warnings: string[];
}

export interface Adapter {
  provider: string;
  /** Throws MappingError when a required field is missing or malformed. */
  toShipment(raw: unknown): Shipment;
}

export class MappingError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider}: ${detail}`);
    this.name = 'MappingError';
  }
}
