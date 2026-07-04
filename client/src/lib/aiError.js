// Maps AI-endpoint failures to calm toasts. 503 (no provider), 502 (provider
// down) and 429 (daily cap) aren't the user's fault and never block manual
// work, so they read as info, not alarming errors.
export function aiToast(err, fallback) {
  if (err?.status === 503 || err?.status === 502) {
    return ['AI is unavailable right now — everything else still works. Try again later.', 'info'];
  }
  if (err?.status === 429 || err?.message?.includes('limit')) {
    return [err?.message || 'Daily AI limit reached — it resets tomorrow.', 'info'];
  }
  return [fallback, 'error'];
}
