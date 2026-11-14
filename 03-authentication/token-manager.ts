export interface AccessToken {
  value: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface TokenManagerOptions {
  fetchToken: () => Promise<AccessToken>;
  /** Refresh this long before the token actually expires. Default: 60s. */
  refreshBeforeMs?: number;
  now?: () => number;
}

/**
 * Caches an OAuth2 access token and refreshes it before it expires.
 *
 * Two bugs it prevents:
 *   1. Waiting for a 401 to find out the token expired.
 *   2. A burst of N concurrent requests triggering N refreshes at once.
 *      Here, the first caller starts the refresh and everyone else awaits the same promise.
 */
export class TokenManager {
  private token?: AccessToken;
  private inFlight?: Promise<AccessToken>;

  constructor(private readonly opts: TokenManagerOptions) {}

  async getToken(): Promise<string> {
    const now = (this.opts.now ?? Date.now)();
    const refreshBefore = this.opts.refreshBeforeMs ?? 60_000;
    if (this.token && this.token.expiresAt - refreshBefore > now) return this.token.value;
    return (await this.refresh()).value;
  }

  /** Call after a 401: the server says the token is no good, whatever its expiry claims. */
  invalidate(): void {
    this.token = undefined;
  }

  private refresh(): Promise<AccessToken> {
    this.inFlight ??= this.opts
      .fetchToken()
      .then((token) => (this.token = token))
      .finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }
}

/** Make a call with a token; on 401, drop the token and try exactly once more. */
export async function callWithToken(tokens: TokenManager, call: (token: string) => Promise<Response>): Promise<Response> {
  const res = await call(await tokens.getToken());
  if (res.status !== 401) return res;
  tokens.invalidate();
  return call(await tokens.getToken());
}

/** OAuth2 client-credentials grant, the usual flavor for server-to-server integrations. */
export function clientCredentials(cfg: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}): () => Promise<AccessToken> {
  return async () => {
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        ...(cfg.scope ? { scope: cfg.scope } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    return { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  };
}
