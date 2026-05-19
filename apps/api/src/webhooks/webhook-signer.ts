import { createHmac, randomBytes } from 'node:crypto';

export function sign(
  secret: string,
  timestamp: number,
  payload: object,
): string {
  const body = JSON.stringify(payload);
  const hmac = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `sha256=${hmac}`;
}

/** Cryptographically strong random secret (64 hex chars / 32 bytes). */
export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}
