import { normalize } from './adapters.js';
import {
  boxlyPayload,
  parcelGoBroken,
  parcelGoPayload,
  swiftShipNewStatus,
  swiftShipPayload,
} from './fixtures.js';

const inputs: [string, unknown][] = [
  ['swiftship', swiftShipPayload],
  ['parcelgo', parcelGoPayload],
  ['boxly', boxlyPayload],
  ['swiftship', swiftShipNewStatus],
  ['parcelgo', parcelGoBroken],
  ['fastbox', {}],
];

console.log('\nThree carriers, three payload shapes, one Shipment model:\n');

for (const [provider, raw] of inputs) {
  const r = normalize(provider, raw);
  if (!r.ok) {
    console.log(`  ❌ ${r.error}`);
    continue;
  }
  const s = r.shipment;
  const money = `${(s.cost.amountMinor / 100).toFixed(2)} ${s.cost.currency}`;
  const flag = s.warnings.length ? `  ⚠️  ${s.warnings.join(', ')}` : '';
  console.log(`  ✅ ${s.id.padEnd(18)} ${s.status.padEnd(12)} ${money.padEnd(11)} ${s.updatedAt}${flag}`);
}

console.log('\nThe rest of the app only ever sees the ✅ shape above.\n');
