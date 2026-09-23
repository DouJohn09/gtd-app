// Sends client crashes to the server (POST /api/client-errors → Sentry).
// Fire-and-forget: reporting must never throw or block the UI. Deduped per
// page load and capped, so a render loop can't flood the endpoint.
const sent = new Set();
let count = 0;
const MAX_PER_LOAD = 10;

export function reportClientError(error, { kind = 'error', componentStack } = {}) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return; // signed-out pages (login) have nothing to attribute it to
    const message = String(error?.message || error || 'Unknown error').slice(0, 500);
    const key = `${kind}:${message}`;
    if (sent.has(key) || count >= MAX_PER_LOAD) return;
    sent.add(key);
    count += 1;
    fetch('/api/client-errors', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kind,
        message,
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : undefined,
        componentStack: componentStack ? String(componentStack).slice(0, 2000) : undefined,
        path: window.location.pathname,
        build: import.meta.env.MODE,
      }),
    }).catch(() => {});
  } catch {
    // never let reporting become the error
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => {
    // Resource load errors (img/script) have no error object; skip them.
    if (e.error) reportClientError(e.error, { kind: 'window.error' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // API errors are already handled (toasts) and logged server-side.
    if (r && typeof r === 'object' && 'status' in r) return;
    reportClientError(r, { kind: 'unhandledrejection' });
  });
}
