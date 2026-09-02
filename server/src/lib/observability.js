import * as Sentry from '@sentry/node';

// Error tracking is opt-in via SENTRY_DSN. With no DSN every call here is a
// no-op, so local dev and tests never talk to Sentry. PII: we send the user id
// (numeric) for grouping, never email or task content.
const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export function captureError(err, context = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.userId) scope.setUser({ id: String(context.userId) });
    if (context.route) scope.setTag('route', context.route);
    if (context.extra) scope.setContext('extra', context.extra);
    Sentry.captureException(err);
  });
}

export async function flushErrors(timeoutMs = 2000) {
  if (!enabled) return;
  try { await Sentry.flush(timeoutMs); } catch { /* shutting down anyway */ }
}

export const errorTrackingEnabled = enabled;
