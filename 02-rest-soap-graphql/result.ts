export type ErrorKind =
  | 'http' // the transport said no: 4xx / 5xx
  | 'business' // 200 OK, but the body says it failed
  | 'soap_fault' // SOAP <Fault> element
  | 'graphql' // GraphQL "errors" array with no usable data
  | 'invalid_response'; // we couldn't make sense of the body

export interface IntegrationError {
  kind: ErrorKind;
  status: number;
  code?: string;
  message: string;
  retryable: boolean;
}

/**
 * One shape for every API style, so the rest of your code
 * never has to know whether the other side spoke REST, SOAP or GraphQL.
 */
export type IntegrationResult<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: IntegrationError };

export const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
