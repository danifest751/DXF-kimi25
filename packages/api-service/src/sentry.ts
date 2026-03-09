import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim() ?? '';

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'dev',
    tracesSampleRate: 0.2,
  });
}

export function sentryRequestHandler() {
  return Sentry.expressErrorHandler();
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!dsn) { console.error('[sentry stub]', err, context); return; }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}
