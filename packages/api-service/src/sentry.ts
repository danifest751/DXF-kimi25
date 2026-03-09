import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim() ?? 'https://ba408c992fbe6d8172360ec010d55f66@o4511016326660096.ingest.us.sentry.io/4511016625045504';

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'dev',
    tracesSampleRate: 0.2,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sentryRequestHandler(): any {
  return Sentry.expressErrorHandler();
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!dsn) { console.error('[sentry stub]', err, context); return; }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}
