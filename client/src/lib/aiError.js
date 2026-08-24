// Maps AI-endpoint failures to calm toasts. 503 (no provider), 502 (provider
// down) and 429 (daily cap) aren't the user's fault and never block manual
// work, so they read as info, not alarming errors.
export function aiToast(err, fallback) {
  if (err?.status === 503 || err?.status === 502) {
    return ['AI is unavailable right now — everything else still works. Try again later.', 'info'];
  }
  // A Free user over the daily cap gets the upgrade modal instead (api.js routes
  // `limit_reached` to UpgradeProvider). Staying silent here keeps them from
  // getting a modal and a toast for the same event. Centralised on purpose: every
  // AI call site funnels through aiToast, so none of them need their own guard.
  if (err?.code === 'limit_reached') return [null, 'info'];
  if (err?.status === 429 || err?.message?.includes('limit')) {
    return [err?.message || 'Daily AI limit reached — it resets tomorrow.', 'info'];
  }
  return [fallback, 'error'];
}
