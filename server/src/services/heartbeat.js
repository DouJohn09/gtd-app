import { pool } from '../db/pool.js';
import { sendEmail } from './email.js';
import { captureError } from '../lib/observability.js';
import { runNotificationCycle } from './notifications.js';

// The server checks itself every 5 minutes: the database, and the public URL
// end to end (Cloudflare → Railway → this app), and stores the result for the
// Pulse page's uptime bar. Two failures in a row mail the founder
// (FOUNDER_NOTIFY_EMAIL) once; the first good check after that mails a
// recovery note. It cannot report its own death — a crashed or unreachable
// Railway service needs an outside monitor (UptimeRobot) for that.
//
// Runs in production only; HEARTBEAT=off disables it, HEARTBEAT=on forces it
// locally.

const INTERVAL_MS = 5 * 60_000;
const FIRST_RUN_MS = 60_000;
const FAILS_BEFORE_ALERT = 2;
const PUBLIC_URL = process.env.HEARTBEAT_URL || 'https://cleartable.app/api/health';

let timer = null;
let consecutiveFails = 0;
let failingSince = null;
let alerted = false;

async function checkOnce() {
  const problems = [];
  let dbMs = null;
  let publicMs = null;

  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    dbMs = Date.now() - t0;
  } catch (err) {
    problems.push(`database: ${err.message}`);
  }

  const t1 = Date.now();
  try {
    const r = await fetch(PUBLIC_URL, {
      headers: { 'User-Agent': 'cleartable-heartbeat/1' },
      signal: AbortSignal.timeout(10_000),
    });
    publicMs = Date.now() - t1;
    if (!r.ok) problems.push(`public health answered ${r.status}`);
  } catch (err) {
    problems.push(`public health: ${err.name === 'TimeoutError' ? 'no answer in 10 s' : err.message}`);
  }

  return { ok: problems.length === 0, dbMs, publicMs, problem: problems.join('; ') || null };
}

async function mailFounder(subject, text) {
  const to = process.env.FOUNDER_NOTIFY_EMAIL;
  if (!to) return;
  const html = `<pre style="font-family:monospace">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
  await sendEmail({ to, subject, text, html }).catch((err) => console.error('[heartbeat] alert mail failed:', err.message));
}

export async function runHeartbeat() {
  const result = await checkOnce();

  await pool.query(
    'INSERT INTO heartbeat_checks (ok, db_ms, public_ms, problem) VALUES ($1, $2, $3, $4)',
    [result.ok, result.dbMs, result.publicMs, result.problem]
  ).catch((err) => console.error('[heartbeat] could not record check:', err.message));
  await pool.query(`DELETE FROM heartbeat_checks WHERE checked_at < NOW() - INTERVAL '30 days'`).catch(() => {});

  if (!result.ok) {
    consecutiveFails++;
    failingSince ||= new Date();
    console.error(`[heartbeat] check failed (${consecutiveFails} in a row): ${result.problem}`);
    if (consecutiveFails >= FAILS_BEFORE_ALERT && !alerted) {
      alerted = true;
      captureError(new Error(`[heartbeat] ${result.problem}`), { route: 'heartbeat' });
      await mailFounder(
        'Cleartable is failing its health check',
        `${consecutiveFails} checks in a row failed since ${failingSince.toISOString()}.\n\n${result.problem}\n\nChecked: database + ${PUBLIC_URL}\nPulse: https://cleartable.app/app/pulse`
      );
    }
  } else {
    if (alerted) {
      const minutes = Math.round((Date.now() - failingSince.getTime()) / 60_000);
      await mailFounder(
        'Cleartable recovered',
        `Health checks pass again after about ${minutes} min of failures (since ${failingSince.toISOString()}).`
      );
    }
    consecutiveFails = 0;
    failingSince = null;
    alerted = false;
  }
  runNotificationCycle().catch(err => console.error('[heartbeat] notification cycle failed:', err.message));

  return result;
}

export function startHeartbeat() {
  const mode = (process.env.HEARTBEAT || '').toLowerCase();
  if (mode === 'off') return;
  if (process.env.NODE_ENV !== 'production' && mode !== 'on') return;
  const tick = () => runHeartbeat().catch((err) => console.error('[heartbeat] run failed:', err.message));
  setTimeout(tick, FIRST_RUN_MS).unref();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  console.log(`[heartbeat] every ${INTERVAL_MS / 60_000} min → database + ${PUBLIC_URL}`);
}
