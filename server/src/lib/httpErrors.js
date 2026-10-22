import { captureError } from './observability.js';
import { recordOpsEvent } from './opsEvents.js';

// The one way a route answers an unexpected failure: log it with the request
// line, report it to Sentry (route handlers catch their own errors, so the
// app-level error middleware never sees them), and send the usual 500 body.
export function serverError(req, res, err, message = 'Internal server error') {
  // Postgres SQLSTATE class 22 (data exception: "high" into an integer column,
  // a malformed date, a number out of range) means the client sent a bad value,
  // not that we broke — answer 400 and keep it out of Sentry and the ops log.
  if (typeof err?.code === 'string' && err.code.startsWith('22')) {
    console.warn(`[bad-input] ${req.method} ${req.originalUrl} · ${err.code} ${err.message}`);
    if (!res.headersSent) res.status(400).json({ error: 'Invalid value' });
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  captureError(err instanceof Error ? err : new Error(String(err)), {
    userId: req.user?.id,
    route: `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`,
  });
  recordOpsEvent('server_error', `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path} · ${err?.name || 'Error'}`);
  if (!res.headersSent) res.status(500).json({ error: message });
}
