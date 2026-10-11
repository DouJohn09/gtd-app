import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.opt_out_capturing();
    },
  });
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
