import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookEvent {
  /** Unique per event. Providers redeliver the same id when they think you missed it. */
  id: string;
  type: string;
  data: {
    objectId: string;
    status: string;
    /** Increases with every change to the object. Arrival order means nothing; this does. */
    version: number;
  };
}

/** Header format: "t=<unix seconds>,v1=<hex hmac of `${t}.${rawBody}`>". */
export function signWebhook(secret: string, rawBody: string, timestampSec: number): string {
  const sig = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
  return `t=${timestampSec},v1=${sig}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'malformed_header' | 'stale_timestamp' | 'bad_signature' };

export function verifyWebhook(secret: string, rawBody: string, header: string, nowSec: number, toleranceSec = 300): VerifyResult {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(nowSec - t) > toleranceSec) return { ok: false, reason: 'stale_timestamp' };
  const expected = Buffer.from(signWebhook(secret, rawBody, t).split('v1=')[1]!, 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

type InboxEntry = { event: WebhookEvent; state: 'pending' | 'done' | 'failed'; attempts: number };

export interface ReceiverOptions {
  secret: string;
  /** Your business logic. May throw; the event stays in the inbox and is retried. */
  handle: (event: WebhookEvent) => Promise<void>;
  nowSec?: () => number;
}

/**
 * The receiving end, split in two on purpose:
 *
 *   receive()        verify -> dedupe by event id -> store in the inbox -> 200, fast.
 *                    Providers time out after a few seconds and redeliver; don't do real work here.
 *   processPending() the worker: apply events, skip ones older than what we already have,
 *                    keep failures in the inbox for the next run.
 *
 * In production the inbox is a table with a unique index on the event id, and the worker is a job/queue.
 */
export class WebhookReceiver {
  readonly inbox = new Map<string, InboxEntry>();
  /** Latest version applied per object, to ignore events that arrive out of order. */
  private readonly applied = new Map<string, number>();

  constructor(private readonly opts: ReceiverOptions) {}

  receive(rawBody: string, signatureHeader: string): { status: number; outcome: string } {
    const now = (this.opts.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
    const check = verifyWebhook(this.opts.secret, rawBody, signatureHeader, now);
    if (!check.ok) return { status: 401, outcome: check.reason };

    let event: WebhookEvent;
    try {
      event = JSON.parse(rawBody) as WebhookEvent;
    } catch {
      return { status: 400, outcome: 'invalid_json' };
    }
    if (this.inbox.has(event.id)) return { status: 200, outcome: 'duplicate' };

    this.inbox.set(event.id, { event, state: 'pending', attempts: 0 });
    return { status: 200, outcome: 'queued' };
  }

  async processPending(): Promise<{ applied: string[]; skipped: string[]; failed: string[] }> {
    const report = { applied: [] as string[], skipped: [] as string[], failed: [] as string[] };
    const todo = [...this.inbox.values()]
      .filter((e) => e.state !== 'done')
      .sort((a, b) => a.event.data.version - b.event.data.version);

    for (const entry of todo) {
      const { event } = entry;
      const current = this.applied.get(event.data.objectId) ?? 0;
      if (event.data.version <= current) {
        entry.state = 'done';
        report.skipped.push(event.id);
        continue;
      }
      try {
        entry.attempts++;
        await this.opts.handle(event);
        this.applied.set(event.data.objectId, event.data.version);
        entry.state = 'done';
        report.applied.push(event.id);
      } catch {
        entry.state = 'failed';
        report.failed.push(event.id);
      }
    }
    return report;
  }
}
