import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim() ?? 'https://8878ea5643657d7a89501fd8ff738f99@o4511016326660096.ingest.us.sentry.io/4511016354185216';

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
