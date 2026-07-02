// Transactional email via Resend's REST API (no SDK dependency — one fetch).
// Dormant until RESEND_API_KEY is set: every send becomes a logged no-op, so
// the app runs locally and in prod without email configured and signup never
// breaks. To activate: verify cleartable.app as a sending domain in Resend,
// then set RESEND_API_KEY and (optionally) WAITLIST_FROM_EMAIL on Railway.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.WAITLIST_FROM_EMAIL || 'Cleartable <hello@cleartable.app>';

export function isEmailConfigured() {
  return Boolean(RESEND_API_KEY);
}

async function send({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY unset — skipping "${subject}" to ${to}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

// Immediate confirmation when someone joins the waitlist. Keeps the promise on
// the landing page ("we'll email you"), proves the signup worked, warms the
// list so the launch email doesn't land cold, and nudges the founder offer.
export async function sendWaitlistWelcome(to) {
  const subject = "You're on the Cleartable waitlist";
  const text = [
    "Thanks for joining the Cleartable waitlist — you're in.",
    "",
    "Cleartable is a calm task app that organizes itself: capture anything in plain language and AI sorts it into the right place, so your inbox, habits, and calendar stay in one quiet spot instead of three noisy apps.",
    "",
    "We're opening access in waves. Waitlist members get first crack at the founder offer — the first 30 buyers lock in $30/year (refundable) before Pro settles at $36/year.",
    "",
    "We'll email you the moment your invite is ready. Nothing else in between.",
    "",
    "— The Cleartable team",
    "cleartable.app",
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a22;line-height:1.6;">
    <h1 style="font-size:22px;margin:0 0 16px;">You're on the list.</h1>
    <p style="margin:0 0 16px;">Thanks for joining the <strong>Cleartable</strong> waitlist — you're in.</p>
    <p style="margin:0 0 16px;">Cleartable is a calm task app that organizes itself: capture anything in plain language and AI sorts it into the right place, so your inbox, habits, and calendar stay in one quiet spot instead of three noisy apps.</p>
    <p style="margin:0 0 16px;">We're opening access in waves. Waitlist members get first crack at the founder offer — the <strong>first 30 buyers lock in $30/year</strong> (refundable) before Pro settles at $36/year.</p>
    <p style="margin:0 0 16px;">We'll email you the moment your invite is ready. Nothing else in between.</p>
    <p style="margin:24px 0 0;color:#6b6b75;font-size:13px;">— The Cleartable team · <a href="https://cleartable.app" style="color:#7c6cff;">cleartable.app</a></p>
  </div>`;

  return send({ to, subject, html, text });
}
