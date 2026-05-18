import * as Sentry from '@sentry/node';

let initialized = false;
let capture4xx = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log('[sentry] disabled (SENTRY_DSN empty)');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  });
  capture4xx = process.env.SENTRY_CAPTURE_4XX === 'true';
  initialized = true;
  // eslint-disable-next-line no-console
  console.log('[sentry] initialized');
}

export function captureFromFilter(
  err: unknown,
  context: { requestId?: string; code?: string; statusCode: number },
): void {
  if (!initialized) return;
  if (context.statusCode < 500 && !capture4xx) return;
  Sentry.captureException(err, {
    tags: {
      requestId: context.requestId,
      code: context.code,
      statusCode: String(context.statusCode),
    },
  });
}

/**
 * Reset internal state — TEST ONLY. Allows a vitest spec to re-exercise
 * `initSentry()` since module-level state persists across spec files in
 * the singleFork pool. Do not call from production code.
 */
export function _resetSentryForTests(): void {
  initialized = false;
  capture4xx = false;
}

export { Sentry };
