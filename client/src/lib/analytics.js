import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

let initialized = false;

// The landing page (cookieless PostHog) keeps its anonymous id in this tab's
// sessionStorage; starting from it links the landing visit to this app session.
// Ignored by PostHog when this browser already has a stored id.
function landingDistinctId() {
  try { return sessionStorage.getItem('_ct_phid') || undefined; } catch { return undefined; }
}

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  const landingId = landingDistinctId();
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    bootstrap: landingId ? { distinctID: landingId } : undefined,
    // Replays show layout, clicks and navigation only: every text node and
    // input is masked, so task titles, notes and emails never leave the browser.
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    mask_all_text: true,
    mask_all_element_attributes: true,
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.opt_out_capturing();
    },
  });
  posthog.register({ site: 'app' });
  initialized = true;
}

export function identifyUser(user) {
  if (!initialized || !user?.id) return;
  posthog.identify(String(user.id), {
    email: user.email,
    name: user.name,
    plan: user.is_pro ? 'pro' : 'free',
    ai_mode: user.ai_mode,
  });
}

export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

export function trackEvent(name, properties) {
  if (!initialized) return;
  posthog.capture(name, properties);
}
