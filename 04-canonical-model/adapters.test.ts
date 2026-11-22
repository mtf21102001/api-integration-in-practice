import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize } from './adapters.js';
import { decimalToMinor } from './convert.js';
import {
  boxlyPayload,
  parcelGoBroken,
  parcelGoPayload,
  swiftShipNewStatus,
  swiftShipPayload,
} from './fixtures.js';

test('every provider maps to the same canonical shape', () => {
  const results = [
    normalize('swiftship', swiftShipPayload),
    normalize('parcelgo', parcelGoPayload),
    normalize('boxly', boxlyPayload),
  ];
  assert.deepEqual(
    results.map((r) => r.ok && r.shipment),
    [
      {
        id: 'swiftship:SS-1001',
        provider: 'swiftship',
        status: 'in_transit',
        cost: { amountMinor: 12550, currency: 'EGP' },
        updatedAt: '2026-11-20T10:15:00.000Z',
        warnings: [],
      },
      {
        id: 'parcelgo:7781',
        provider: 'parcelgo',
        status: 'delivered',
        cost: { amountMinor: 9900, currency: 'USD' },
        updatedAt: '2026-11-21T10:15:00.000Z',
        warnings: [],
      },
      {
        id: 'boxly:B-55',
        provider: 'boxly',
        status: 'delivered',
        cost: { amountMinor: 4000, currency: 'EUR' },
        updatedAt: '2026-11-20T09:30:00.000Z',
        warnings: [],
      },
    ],
  );
});

test('an unknown status becomes "unknown" with a warning, not a crash or a guess', () => {
  const r = normalize('swiftship', swiftShipNewStatus);
  assert.ok(r.ok);
  assert.equal(r.shipment.status, 'unknown');
  assert.deepEqual(r.shipment.warnings, ['unmapped status "HELD_AT_CUSTOMS"']);
});

test('a missing required field is a clear error', () => {
  assert.deepEqual(normalize('parcelgo', parcelGoBroken), { ok: false, error: 'parcelgo: missing field "fee.cents"' });
  assert.deepEqual(normalize('nope', {}), { ok: false, error: 'no adapter for provider "nope"' });
});

test('decimal strings convert to minor units exactly', () => {
  assert.equal(decimalToMinor('0.1', 'x') + decimalToMinor('0.2', 'x'), 30);
  assert.equal(decimalToMinor('19.99', 'x'), 1999);
  assert.equal(decimalToMinor('7', 'x'), 700);
  assert.throws(() => decimalToMinor('12.345', 'x'), /invalid amount/);
  assert.throws(() => decimalToMinor('1,200.00', 'x'), /invalid amount/);
});
