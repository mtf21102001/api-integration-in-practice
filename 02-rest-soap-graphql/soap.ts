import { type IntegrationResult } from './result.js';

// Namespace-agnostic: matches <Fault>, <soap:Fault>, <env:Fault>...
const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`);
const text = (xml: string, name: string) => xml.match(tag(name))?.[1]?.trim();

/**
 * SOAP reports errors as a <Fault> inside the envelope, usually with HTTP 500.
 * Handles both SOAP 1.1 (faultcode / faultstring) and SOAP 1.2 (Code/Value, Reason/Text).
 *
 * This is a teaching example. In production, generate a client from the WSDL
 * and use a real XML parser instead of regular expressions.
 */
export function parseSoap(status: number, xml: string): IntegrationResult<string> {
  const fault = text(xml, 'Fault');
  if (fault !== undefined) {
    const code = text(fault, 'faultcode') ?? text(fault, 'Value') ?? 'Unknown';
    const message = text(fault, 'faultstring') ?? text(fault, 'Text') ?? 'SOAP fault';
    // Server/Receiver faults are on their side and may pass; Client/Sender faults are on ours.
    const retryable = /Server|Receiver/i.test(code);
    return { ok: false, error: { kind: 'soap_fault', status, code, message, retryable } };
  }

  if (status >= 400) {
    return { ok: false, error: { kind: 'http', status, message: `HTTP ${status} without a SOAP fault`, retryable: status >= 500 } };
  }

  const body = text(xml, 'Body');
  if (body === undefined) {
    return { ok: false, error: { kind: 'invalid_response', status, message: 'no SOAP Body found', retryable: false } };
  }
  return { ok: true, data: body };
}
