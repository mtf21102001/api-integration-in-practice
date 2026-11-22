import { MappingError, type ShipmentStatus } from './shipment.js';

/** "125.5" -> 12550. Parses the string directly: 0.1 + 0.2 never gets a chance. */
export function decimalToMinor(value: string, provider: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new MappingError(provider, `invalid amount "${value}"`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function currencyCode(value: unknown, provider: string): string {
  if (typeof value !== 'string' || !/^[a-z]{3}$/i.test(value)) {
    throw new MappingError(provider, `invalid currency "${String(value)}"`);
  }
  return value.toUpperCase();
}

/** Looks a status up in the provider's table; anything new becomes 'unknown' plus a warning. */
export function mapStatus(
  table: Record<string, ShipmentStatus>,
  raw: string,
  warnings: string[],
): ShipmentStatus {
  const status = table[raw];
  if (status) return status;
  warnings.push(`unmapped status "${raw}"`);
  return 'unknown';
}

export function requireField<T>(value: T | undefined | null, name: string, provider: string): T {
  if (value === undefined || value === null || value === '') {
    throw new MappingError(provider, `missing field "${name}"`);
  }
  return value;
}
