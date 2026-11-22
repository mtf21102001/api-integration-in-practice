import { correlationId } from './context.js';
import { redact } from './redact.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  ts: string;
  level: Level;
  msg: string;
  correlationId?: string;
  [field: string]: unknown;
}

/**
 * Structured logs: one JSON object per line, so you can filter by
 * provider, status or correlationId instead of grepping sentences.
 * Every line is redacted before it is written.
 */
export function createLogger(sink: (line: LogLine) => void = (l) => console.log(JSON.stringify(l)), now = () => new Date()) {
  const write = (level: Level, msg: string, fields: Record<string, unknown> = {}) =>
    sink({
      ts: now().toISOString(),
      level,
      msg,
      correlationId: correlationId(),
      ...(redact(fields) as Record<string, unknown>),
    });
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
