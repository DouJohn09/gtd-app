import { captureError } from './observability.js';
import { recordOpsEvent } from './opsEvents.js';

// The one way a route answers an unexpected failure: log it with the request
// line, report it to Sentry (route handlers catch their own errors, so the
// app-level error middleware never sees them), and send the usual 500 body.
export function serverError(req, res, err, message = 'Internal server error') {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  captureError(err instanceof Error ? err : new Error(String(err)), {
    userId: req.user?.id,
    route: `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`,
  });
  recordOpsEvent('server_error', `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path} · ${err?.name || 'Error'}`);
  if (!res.headersSent) res.status(500).json({ error: message });
}
