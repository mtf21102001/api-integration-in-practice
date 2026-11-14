import { isObject, isRetryableStatus, type IntegrationResult } from './result.js';

interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string };
}

/**
 * GraphQL usually answers 200 OK even when something went wrong.
 * The truth is in the body:
 *   - errors and no data       -> failure
 *   - errors AND data          -> partial success: keep the data, surface the errors
 *   - data only                -> success
 */
export function parseGraphQL<T = unknown>(status: number, body: unknown): IntegrationResult<T> {
  if (status >= 400) {
    return { ok: false, error: { kind: 'http', status, message: `HTTP ${status}`, retryable: isRetryableStatus(status) } };
  }
  if (!isObject(body)) {
    return { ok: false, error: { kind: 'invalid_response', status, message: 'body is not an object', retryable: false } };
  }

  const errors = Array.isArray(body.errors) ? (body.errors as GraphQLError[]) : [];
  const describe = (e: GraphQLError) => (e.path ? `${e.path.join('.')}: ${e.message}` : e.message);
  const hasData = isObject(body.data) && Object.values(body.data).some((v) => v !== null);

  if (errors.length > 0 && !hasData) {
    return {
      ok: false,
      error: {
        kind: 'graphql',
        status,
        code: errors[0].extensions?.code,
        message: errors.map(describe).join('; '),
        retryable: false,
      },
    };
  }

  if (!hasData) {
    return { ok: false, error: { kind: 'invalid_response', status, message: 'no data and no errors', retryable: false } };
  }

  return { ok: true, data: body.data as T, warnings: errors.length ? errors.map(describe) : undefined };
}
