import { boxlyPayload, parcelGoPayload, swiftShipPayload } from '../04-canonical-model/fixtures.js';
import { HttpError } from '../05-retries-backoff/retry.js';
import type { CarrierTransport } from './tokens.js';

/**
 * Stand-in carriers so the app runs with no network and no accounts.
 * "parcelgo" fails twice with 503 before answering, to show the retry at work.
 */
export function createFakeCarriers(): CarrierTransport & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const payloads: Record<string, unknown> = {
    swiftship: swiftShipPayload,
    parcelgo: parcelGoPayload,
    boxly: boxlyPayload,
  };
  const transport = async (provider: string, shipmentId: string) => {
    calls[provider] = (calls[provider] ?? 0) + 1;
    await new Promise((r) => setTimeout(r, 15));
    if (shipmentId === 'missing') throw new HttpError(404);
    if (shipmentId === 'down') throw new HttpError(503);
    if (provider === 'parcelgo' && calls[provider]! <= 2) throw new HttpError(503);
    return payloads[provider];
  };
  return Object.assign(transport, { calls });
}
