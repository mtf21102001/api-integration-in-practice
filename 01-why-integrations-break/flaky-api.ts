import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// The ways a third-party API lets you down, one mode each.
export const MODES = ['ok', 'slow', 'error', 'shape', 'ratelimit'] as const;
export type Mode = (typeof MODES)[number];

export interface FlakyApi {
  url: string;
  close(): Promise<void>;
}

export interface FlakyApiOptions {
  port?: number;
  /** How long "slow" mode waits before answering. */
  slowMs?: number;
}

const order = (id: string) => ({ id, status: 'paid', total: 49.9, currency: 'USD' });

/**
 * A small HTTP server that behaves like a real-world API on a bad day.
 *
 *   GET /orders/:id?mode=ok|slow|error|shape|ratelimit|random
 */
export async function startFlakyApi(opts: FlakyApiOptions = {}): Promise<FlakyApi> {
  const slowMs = opts.slowMs ?? 5000;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = url.pathname.match(/^\/orders\/([\w-]+)$/);
    if (req.method !== 'GET' || !match) return send(res, 404, { error: 'not found' });

    const id = match[1];
    let mode = (url.searchParams.get('mode') ?? 'random') as Mode | 'random';
    if (mode === 'random') mode = MODES[Math.floor(Math.random() * MODES.length)];

    switch (mode) {
      case 'ok':
        return send(res, 200, order(id));
      case 'slow': {
        const timer = setTimeout(() => send(res, 200, order(id)), slowMs);
        res.on('close', () => clearTimeout(timer)); // client gave up
        return;
      }
      case 'error':
        return send(res, 500, { message: 'Internal Server Error' });
      case 'shape':
        // Same data, renamed fields and a string amount: a "minor" version bump on their side.
        return send(res, 200, { data: { orderId: id, state: 'PAID', amount: '49.90' } });
      case 'ratelimit':
        return send(res, 429, { message: 'Too Many Requests' }, { 'Retry-After': '30' });
      default:
        return send(res, 400, { error: `unknown mode: ${String(mode)}` });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://localhost:${port}`, close: () => closeServer(server) };
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
