import * as Sentry from '@sentry/browser';

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? 'https://f31520f272675cbfd6081fd5a7ae701d@o4511016326660096.ingest.us.sentry.io/4511016624652288';

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) ?? 'dev',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  });
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!dsn) { console.error('[sentry stub]', err, context); return; }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}
