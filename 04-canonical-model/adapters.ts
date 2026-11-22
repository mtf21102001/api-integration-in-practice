import { currencyCode, decimalToMinor, mapStatus, requireField } from './convert.js';
import { MappingError, type Adapter, type Shipment, type ShipmentStatus } from './shipment.js';

// Three made-up carriers, each with its own idea of what a shipment looks like.
// Each adapter is the only place that knows about its provider's quirks.

/** Flat snake_case JSON, price as a decimal string, local-time offsets. */
export const swiftShip: Adapter = {
  provider: 'swiftship',
  toShipment(raw) {
    const r = raw as {
      tracking_no?: string;
      state?: string;
      price?: string;
      currency?: string;
      last_update?: string;
    };
    const p = this.provider;
    const warnings: string[] = [];
    const statuses: Record<string, ShipmentStatus> = {
      CREATED: 'created',
      IN_TRANSIT: 'in_transit',
      OUT_FOR_DELIVERY: 'out_for_delivery',
      DELIVERED: 'delivered',
      DELIVERY_FAILED: 'failed',
      RETURNED: 'returned',
    };
    return {
      id: `${p}:${requireField(r.tracking_no, 'tracking_no', p)}`,
      provider: p,
      status: mapStatus(statuses, requireField(r.state, 'state', p), warnings),
      cost: {
        amountMinor: decimalToMinor(requireField(r.price, 'price', p), p),
        currency: currencyCode(r.currency, p),
      },
      updatedAt: toUtc(requireField(r.last_update, 'last_update', p), p),
      warnings,
    };
  },
};

/** Deeply nested, numeric ids, numeric status codes, money already in cents, Unix seconds. */
export const parcelGo: Adapter = {
  provider: 'parcelgo',
  toShipment(raw) {
    const s = (raw as { data?: { shipment?: Record<string, unknown> } })?.data?.shipment;
    const p = this.provider;
    if (!s) throw new MappingError(p, 'missing "data.shipment"');
    const fee = s.fee as { cents?: number; cur?: string } | undefined;
    const warnings: string[] = [];
    const statuses: Record<string, ShipmentStatus> = {
      '1': 'created',
      '2': 'in_transit',
      '3': 'out_for_delivery',
      '4': 'delivered',
      '8': 'failed',
      '9': 'returned',
    };
    const cents = requireField(fee?.cents, 'fee.cents', p);
    if (!Number.isInteger(cents)) throw new MappingError(p, `invalid amount "${cents}"`);
    const updated = Number(requireField(s.updated as number, 'updated', p));
    return {
      id: `${p}:${requireField(s.ref as number, 'ref', p)}`,
      provider: p,
      status: mapStatus(statuses, String(requireField(s.statusCode as number, 'statusCode', p)), warnings),
      cost: { amountMinor: cents, currency: currencyCode(fee?.cur, p) },
      updatedAt: new Date(updated * 1000).toISOString(),
      warnings,
    };
  },
};

/** Converted from XML: PascalCase, free-text statuses, "DD/MM/YYYY HH:mm" in UTC per their docs. */
export const boxly: Adapter = {
  provider: 'boxly',
  toShipment(raw) {
    const s = (raw as { Shipment?: Record<string, unknown> })?.Shipment;
    const p = this.provider;
    if (!s) throw new MappingError(p, 'missing "Shipment"');
    const charge = s.Charge as { Amount?: string; Currency?: string } | undefined;
    const warnings: string[] = [];
    // Free text like "Delivered - signed by recipient": match on the part before the dash.
    const text = String(requireField(s.Status as string, 'Status', p));
    const statuses: Record<string, ShipmentStatus> = {
      registered: 'created',
      'in transit': 'in_transit',
      'with courier': 'out_for_delivery',
      delivered: 'delivered',
      'delivery attempt failed': 'failed',
      'returned to sender': 'returned',
    };
    const key = text.split(' - ')[0]!.trim().toLowerCase();
    const status = statuses[key] ?? mapStatus({}, text, warnings);
    return {
      id: `${p}:${requireField(s.Id as string, 'Id', p)}`,
      provider: p,
      status,
      cost: {
        amountMinor: decimalToMinor(requireField(charge?.Amount, 'Charge.Amount', p), p),
        currency: currencyCode(charge?.Currency, p),
      },
      updatedAt: parseDayFirst(String(requireField(s.Timestamp as string, 'Timestamp', p)), p),
      warnings,
    };
  },
};

function toUtc(value: string, provider: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new MappingError(provider, `invalid date "${value}"`);
  return d.toISOString();
}

/** new Date("20/11/2026") is Invalid Date, or worse, silently month-first. Parse it by hand. */
function parseDayFirst(value: string, provider: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new MappingError(provider, `invalid date "${value}"`);
  const [, dd, mm, yyyy, hh, min] = m;
  return toUtc(`${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`, provider);
}

export const adapters: Record<string, Adapter> = Object.fromEntries(
  [swiftShip, parcelGo, boxly].map((a) => [a.provider, a]),
);

export type NormalizeResult = { ok: true; shipment: Shipment } | { ok: false; error: string };

/** The single entry point: provider name + raw payload in, canonical shipment (or a clear error) out. */
export function normalize(provider: string, raw: unknown): NormalizeResult {
  const adapter = adapters[provider];
  if (!adapter) return { ok: false, error: `no adapter for provider "${provider}"` };
  try {
    return { ok: true, shipment: adapter.toShipment(raw) };
  } catch (err) {
    if (err instanceof MappingError) return { ok: false, error: err.message };
    throw err;
  }
}
