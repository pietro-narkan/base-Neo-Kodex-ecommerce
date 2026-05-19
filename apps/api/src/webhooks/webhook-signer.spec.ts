import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { sign } from './webhook-signer';

describe('WebhookSigner.sign', () => {
  it('returns HMAC-SHA256 hex prefixed with sha256=', () => {
    const secret = 'topsecret';
    const timestamp = 1779200000;
    const payload = { event: 'order.paid', data: { id: 'x' } };
    const result = sign(secret, timestamp, payload);

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(payload)}`)
      .digest('hex');

    expect(result).toBe(`sha256=${expected}`);
  });

  it('is deterministic for same inputs', () => {
    const a = sign('s', 100, { x: 1 });
    const b = sign('s', 100, { x: 1 });
    expect(a).toBe(b);
  });

  it('differs when secret changes', () => {
    const a = sign('s1', 100, { x: 1 });
    const b = sign('s2', 100, { x: 1 });
    expect(a).not.toBe(b);
  });

  it('differs when timestamp changes', () => {
    const a = sign('s', 100, { x: 1 });
    const b = sign('s', 101, { x: 1 });
    expect(a).not.toBe(b);
  });
});
