import { isObject, isRetryableStatus, type IntegrationResult } from './result.js';

/**
 * REST APIs agree on almost nothing. This handles the two patterns you'll meet most:
 *   - errors as HTTP status codes (400, 404, 500...)
 *   - errors as 200 OK with { "success": false } in the body
 */
export function parseRest<T = unknown>(status: number, body: unknown): IntegrationResult<T> {
  const fields = isObject(body) ? body : {};
  const message = String(fields.message ?? fields.error ?? fields.error_description ?? `HTTP ${status}`);
  const code = fields.code ?? fields.errorCode;

  if (status >= 400) {
    return {
      ok: false,
      error: { kind: 'http', status, code: code ? String(code) : undefined, message, retryable: isRetryableStatus(status) },
    };
  }

  if (fields.success === false || fields.status === 'error') {
    return {
      ok: false,
      error: { kind: 'business', status, code: code ? String(code) : undefined, message, retryable: false },
    };
  }

  if (body === null || body === undefined) {
    return { ok: false, error: { kind: 'invalid_response', status, message: 'empty body', retryable: false } };
  }

  return { ok: true, data: ('data' in fields ? fields.data : body) as T };
}
