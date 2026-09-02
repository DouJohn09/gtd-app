// Transactional email via Resend's REST API (no SDK dependency — one fetch).
// Dormant until RESEND_API_KEY is set: every send becomes a logged no-op, so
// the app runs locally and in prod without email configured. To activate:
// verify cleartable.app as a sending domain in Resend, then set RESEND_API_KEY
// and (optionally) WAITLIST_FROM_EMAIL on Railway.
//
// Two mails live here: the first-sign-in welcome, and a one-line note to the
// founder for every new account (FOUNDER_NOTIFY_EMAIL) — at launch volume a
// per-signup ping beats a digest and needs no scheduler.

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
export { send as sendEmail };

const APP_URL = process.env.APP_URL || 'https://cleartable.app/app';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sent once, right after an account is created. Short, plain, from a person.
// Its one job: get the first three things captured, and open a reply channel.
export async function sendWelcome(to, name) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  const hi = first ? `Hi ${first},` : 'Hi,';
  const subject = 'Welcome to Cleartable';
  const text = [
    hi,
    '',
    "Thanks for signing in. Cleartable is a calm place for your tasks, habits, and calendar — capture in plain words and AI sorts it into the right list.",
    '',
    'A good first five minutes:',
    '1. Capture three things on your mind, however messy. Just type them.',
    '2. Open Inbox and let AI process it — accept or fix what it suggests.',
    '3. Tomorrow morning, tap "Plan my day" and see what fits around your calendar.',
    '',
    `Open the app: ${APP_URL}`,
    '',
    "I'm a solo founder building this in the open. If anything is confusing, slow, or missing, reply to this email — I read every one and it shapes what gets built next.",
    '',
    '— Jan, Cleartable',
  ].join('\n');
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a22;line-height:1.6;">
    <p style="margin:0 0 16px;">${escapeHtml(hi)}</p>
    <p style="margin:0 0 16px;">Thanks for signing in. <strong>Cleartable</strong> is a calm place for your tasks, habits, and calendar — capture in plain words and AI sorts it into the right list.</p>
    <p style="margin:0 0 8px;">A good first five minutes:</p>
    <ol style="margin:0 0 16px;padding-left:20px;">
      <li>Capture three things on your mind, however messy. Just type them.</li>
      <li>Open <strong>Inbox</strong> and let AI process it — accept or fix what it suggests.</li>
      <li>Tomorrow morning, tap <strong>Plan my day</strong> and see what fits around your calendar.</li>
    </ol>
    <p style="margin:0 0 16px;"><a href="${APP_URL}" style="display:inline-block;background:#7c6cff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Open Cleartable</a></p>
    <p style="margin:0 0 16px;">I'm a solo founder building this in the open. If anything is confusing, slow, or missing, <strong>reply to this email</strong> — I read every one and it shapes what gets built next.</p>
    <p style="margin:24px 0 0;color:#6b6b75;font-size:13px;">— Jan, <a href="https://cleartable.app" style="color:#7c6cff;">Cleartable</a></p>
  </div>`;
  return send({ to, subject, html, text });
}

// One line to the founder per new account, so arrivals are noticed the hour
// they happen. Off unless FOUNDER_NOTIFY_EMAIL is set.
export async function notifyFounderSignup({ email, name, id }) {
  const to = process.env.FOUNDER_NOTIFY_EMAIL;
  if (!to) return { skipped: true };
  const subject = `New Cleartable sign-up: ${email}`;
  const text = `${name || '(no name)'} <${email}> · user #${id} · ${new Date().toISOString()}`;
  return send({ to, subject, text, html: `<p style="font-family:monospace">${escapeHtml(text)}</p>` });
}
