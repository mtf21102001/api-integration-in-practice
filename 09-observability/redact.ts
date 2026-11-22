const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|card|cvv|cvc|iban|pin/i;
const CARD_NUMBER = /\b(?:\d[ -]?){12,18}(\d{4})\b/g;

/**
 * Make a request/response safe to log: sensitive keys are masked at any depth,
 * and anything that looks like a card number keeps only its last 4 digits.
 * Logs get copied to dashboards, tickets and chat; assume they will leak.
 */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(CARD_NUMBER, '****$1');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? mask(v) : redact(v)]),
    );
  }
  return value;
}

function mask(v: unknown): string {
  const s = String(v ?? '');
  return s.length > 8 ? `****${s.slice(-4)}` : '****';
}
