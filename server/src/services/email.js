// Transactional email via Resend's REST API (no SDK dependency — one fetch).
// Dormant until RESEND_API_KEY is set: every send becomes a logged no-op, so
// the app runs locally and in prod without email configured. To activate:
// verify cleartable.app as a sending domain in Resend, then set RESEND_API_KEY
// and (optionally) WAITLIST_FROM_EMAIL on Railway.
//
// The waitlist welcome mail that used to live here was removed 2026-09-02
// together with the public /api/waitlist route (sign-in is open now, and the
// unauthenticated route doubled as an outbound mail relay).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.WAITLIST_FROM_EMAIL || 'Cleartable <hello@cleartable.app>';

export function isEmailConfigured() {
  return Boolean(RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html, text }) {
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
