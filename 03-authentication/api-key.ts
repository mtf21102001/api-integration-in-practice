/**
 * API keys are simple. The trouble is where they leak:
 * git history, logs, error messages, and frontend bundles.
 */

/** Read a secret from the environment and fail fast at startup if it's missing. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Safe to log: shows only enough to tell two keys apart. */
export function redact(secret: string): string {
  return secret.length <= 8 ? '****' : `****${secret.slice(-4)}`;
}

/** Strip known secrets out of any string before it reaches a log line. */
export function scrub(text: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((out, s) => out.split(s).join(redact(s)), text);
}
