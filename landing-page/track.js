// Capture referrer + UTM on first landing so the app can read them at signup.
// sessionStorage survives navigation to /app/login but not new tabs.
try {
  if (!sessionStorage.getItem('_ct_ref') && document.referrer && !document.referrer.includes('cleartable.app')) {
    sessionStorage.setItem('_ct_ref', document.referrer);
  }
  var p = new URLSearchParams(location.search);
  ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref'].forEach(function(k) {
    var v = p.get(k); if (v) sessionStorage.setItem('_ct_' + k, v);
  });
} catch(e) {}
