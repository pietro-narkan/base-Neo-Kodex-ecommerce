import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  userType?: 'admin' | 'customer';
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function withRequestContext<T>(
  store: RequestContextStore,
  fn: () => T,
): T {
  return requestContext.run(store, fn);
}
