/* Cleartable — PostHog on the marketing site (EU cloud).
   Cookieless: persistence is in memory only, so nothing is written to cookies
   or localStorage and no consent banner is needed. One random id lives in
   sessionStorage for the current tab so a visitor who clicks through to /app
   keeps the same PostHog identity (the app bootstraps from it), which links
   landing page -> sign-in -> first task into one journey. Session replay
   covers these public pages; inputs are masked. */
(function () {
  var KEY = 'phc_mMtTYMDa95YHgD4vU2PAM3VM7nTG4xrwrQWhfwVsSi4C';
  var host = location.hostname;
  if (host !== 'cleartable.app' && host !== 'www.cleartable.app') return; // no tracking on local/preview
  /* Founder/team browsers (marked by the app on sign-in) are not visitors. */
  try { if (localStorage.getItem('ct_internal') === '1') return; } catch (e) { /* storage blocked */ }

  var id;
  try {
    id = sessionStorage.getItem('_ct_phid');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      sessionStorage.setItem('_ct_phid', id);
    }
  } catch (e) { /* storage blocked — PostHog makes its own in-memory id */ }

  /* Official PostHog loader stub: queues calls until array.js arrives. */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias set_config reset opt_out_capturing opt_in_capturing get_distinct_id get_session_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(KEY, {
    api_host: 'https://eu.i.posthog.com',
    persistence: 'memory',
    bootstrap: id ? { distinctID: id } : undefined,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: { maskAllInputs: true },
  });
  posthog.register({ site: 'landing' });

  /* Sign-up button clicks, for the Pulse funnel. Sent as a beacon so the
     navigation to /app doesn't cancel it. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="/app"]');
    if (!a) return;
    posthog.capture('cta_clicked', {
      label: (a.textContent || '').trim().slice(0, 40),
      page: location.pathname,
    }, { transport: 'sendBeacon' });
  }, true);
})();
