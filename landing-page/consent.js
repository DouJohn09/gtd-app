/* Cleartable — cookie consent + Google Analytics loader.
   GA4 loads only after the visitor accepts (basic Consent Mode); the choice
   is remembered for 12 months. With the placeholder ID nothing runs at all. */
(function () {
  var GA_ID = 'G-XXXXXXXXXX';
  if (GA_ID.indexOf('XXXX') !== -1) return; // GA not configured yet — no banner, no tracking

  var KEY = 'ct-consent';
  var MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  function readChoice() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved.t || Date.now() - saved.t > MAX_AGE_MS) {
        localStorage.removeItem(KEY);
        return null;
      }
      return saved.v;
    } catch (e) {
      return null;
    }
  }

  function saveChoice(v) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() }));
    } catch (e) { /* private mode — banner will just reappear */ }
  }

  function loadGA() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted'
    });
    gtag('js', new Date());
    gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function showBanner() {
    var style = document.createElement('style');
    style.textContent =
      '.ct-consent{position:fixed;bottom:20px;left:20px;right:20px;z-index:999;max-width:420px;' +
      'padding:20px;border-radius:16px;background:rgba(21,21,30,0.92);' +
      'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);' +
      'border:1px solid rgba(255,255,255,0.16);box-shadow:0 24px 60px -12px rgba(0,0,0,0.5);' +
      'font-size:13.5px;line-height:1.55;color:rgba(255,255,255,0.75);}' +
      '.ct-consent a{color:var(--violet,#A78BFA);text-decoration:underline;}' +
      '.ct-consent-actions{display:flex;gap:10px;margin-top:14px;}' +
      '.ct-consent-actions button{flex:1;padding:9px 16px;border-radius:10px;font-size:13.5px;' +
      'font-family:inherit;cursor:pointer;transition:opacity 200ms ease;}' +
      '.ct-consent-actions button:hover{opacity:0.85;}' +
      '.ct-consent-accept{border:none;background:var(--violet-deep,#7C3AED);color:#fff;}' +
      '.ct-consent-decline{border:1px solid rgba(255,255,255,0.16);background:transparent;' +
      'color:rgba(255,255,255,0.75);}' +
      '@media (min-width:640px){.ct-consent{right:auto;}}';
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.className = 'ct-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML =
      'Can we use Google Analytics to understand how visitors use this site? ' +
      'No ads, no cross-site tracking. <a href="/privacy.html">Privacy policy</a>' +
      '<div class="ct-consent-actions">' +
      '<button type="button" class="ct-consent-decline">Decline</button>' +
      '<button type="button" class="ct-consent-accept">Accept</button>' +
      '</div>';

    el.querySelector('.ct-consent-accept').addEventListener('click', function () {
      saveChoice('granted');
      el.remove();
      loadGA();
    });
    el.querySelector('.ct-consent-decline').addEventListener('click', function () {
      saveChoice('denied');
      el.remove();
    });
    document.body.appendChild(el);
  }

  // Lets privacy.html offer a "reset your cookie choice" link.
  window.ctConsentReset = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  var choice = readChoice();
  if (choice === 'granted') loadGA();
  else if (choice === null) showBanner();
})();
