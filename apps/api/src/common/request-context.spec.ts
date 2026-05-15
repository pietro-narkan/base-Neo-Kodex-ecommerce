import { describe, it, expect } from 'vitest';
import { requestContext, withRequestContext } from './request-context';

describe('request-context', () => {
  it('returns undefined when no context active', () => {
    expect(requestContext.getStore()).toBeUndefined();
  });

  it('exposes requestId inside withRequestContext', () => {
    let observed: string | undefined;
    withRequestContext({ requestId: 'abc-123' }, () => {
      observed = requestContext.getStore()?.requestId;
    });
    expect(observed).toBe('abc-123');
  });

  it('isolates context between concurrent runs', async () => {
    const results = await Promise.all([
      new Promise<string | undefined>((resolve) => {
        withRequestContext({ requestId: 'one' }, () => {
          setTimeout(() => resolve(requestContext.getStore()?.requestId), 10);
        });
      }),
      new Promise<string | undefined>((resolve) => {
        withRequestContext({ requestId: 'two' }, () => {
          setTimeout(() => resolve(requestContext.getStore()?.requestId), 5);
        });
      }),
    ]);
    expect(results).toEqual(['one', 'two']);
  });
});
