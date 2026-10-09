import { pool } from '../db/pool.js';
import { sendEmail } from './email.js';
import { captureError } from '../lib/observability.js';
import { todayInTz } from '../lib/dateTime.js';
import crypto from 'crypto';

// Runs every heartbeat tick (5 min). For each user whose timezone makes it
// ~8 AM local and who hasn't had today's email yet, sends a digest of tasks
// due today + overdue. Skips users who opted out or have nothing due.

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || 'cleartable-unsub-default';
const APP_URL = process.env.APP_URL || 'https://cleartable.app/app';
const BASE_URL = process.env.BASE_URL || 'https://cleartable.app';

function unsubToken(userId) {
  return crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(String(userId)).digest('hex').slice(0, 32);
}

export function verifyUnsubToken(userId, token) {
  return token === unsubToken(userId);
}

function getNotifPrefs(raw) {
  const d = raw || {};
  return {
    daily_email: d.daily_email !== false,
  };
}

function isDeliveryWindow(tz) {
  try {
    const hour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const h = parseInt(hour, 10);
    return h >= 7 && h <= 8;
  } catch {
    return false;
  }
}

export async function runNotificationCycle() {
  let sent = 0;
  try {
    const { rows: users } = await pool.query(`
      SELECT id, email, name, timezone, notification_prefs, last_daily_email_at
      FROM users
      WHERE timezone IS NOT NULL
    `);

    for (const user of users) {
      try {
        const prefs = getNotifPrefs(user.notification_prefs);
        if (!prefs.daily_email) continue;

        if (!isDeliveryWindow(user.timezone)) continue;

        const userToday = todayInTz(user.timezone);
        if (user.last_daily_email_at && user.last_daily_email_at.toISOString().slice(0, 10) >= userToday) continue;

        const { rows: tasks } = await pool.query(`
          SELECT title, due_date, priority, project_id, list
          FROM tasks
          WHERE user_id = $1
            AND list NOT IN ('completed', 'someday_maybe')
            AND due_date IS NOT NULL
            AND due_date <= $2::date
          ORDER BY due_date ASC, priority DESC
          LIMIT 20
        `, [user.id, userToday]);

        if (tasks.length === 0) {
          await pool.query('UPDATE users SET last_daily_email_at = $1 WHERE id = $2', [userToday, user.id]);
          continue;
        }

        const overdue = tasks.filter(t => t.due_date.toISOString().slice(0, 10) < userToday);
        const today = tasks.filter(t => t.due_date.toISOString().slice(0, 10) === userToday);

        const firstName = (user.name || '').trim().split(/\s+/)[0] || '';
        const unsubLink = `${BASE_URL}/api/notifications/unsubscribe?u=${user.id}&t=${unsubToken(user.id)}`;

        const { subject, html, text } = buildDailyEmail({ firstName, today, overdue, unsubLink });
        await sendEmail({ to: user.email, subject, html, text });
        await pool.query('UPDATE users SET last_daily_email_at = $1 WHERE id = $2', [userToday, user.id]);
        sent++;
      } catch (err) {
        console.error(`[notifications] failed for user ${user.id}:`, err.message);
        captureError(err, { userId: user.id, route: 'notifications' });
      }
    }
  } catch (err) {
    console.error('[notifications] cycle failed:', err.message);
    captureError(err, { route: 'notifications' });
  }
  return sent;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(d) {
  const ds = d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
  return ds;
}

function buildDailyEmail({ firstName, today, overdue, unsubLink }) {
  const hi = firstName ? `Hi ${firstName},` : 'Hi,';
  const todayCount = today.length;
  const overdueCount = overdue.length;

  const subject = overdueCount > 0
    ? `${todayCount} task${todayCount !== 1 ? 's' : ''} due today + ${overdueCount} overdue`
    : `${todayCount} task${todayCount !== 1 ? 's' : ''} due today`;

  const taskLine = (t, label) => {
    const prio = t.priority >= 2 ? ' !!' : t.priority === 1 ? ' !' : '';
    return `${label ? `[${label}] ` : ''}${t.title}${prio}`;
  };

  const taskHtml = (t, label) => {
    const prio = t.priority >= 2
      ? ' <span style="color:#ef4444;font-weight:600">!!</span>'
      : t.priority === 1
        ? ' <span style="color:#f59e0b;font-weight:600">!</span>'
        : '';
    const tag = label ? `<span style="color:#9ca3af;font-size:12px;">${esc(label)}</span> ` : '';
    return `<li style="margin:4px 0;">${tag}${esc(t.title)}${prio}</li>`;
  };

  let textLines = [hi, ''];
  let htmlParts = [];

  if (today.length > 0) {
    textLines.push(`Due today (${todayCount}):`);
    today.forEach(t => textLines.push(`  - ${taskLine(t)}`));
    textLines.push('');

    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#7c6cff;">Due today (${todayCount})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${today.map(t => taskHtml(t)).join('')}</ul>`);
  }

  if (overdue.length > 0) {
    textLines.push(`Overdue (${overdueCount}):`);
    overdue.forEach(t => textLines.push(`  - ${taskLine(t, formatDate(t.due_date))}`));
    textLines.push('');

    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#ef4444;">Overdue (${overdueCount})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${overdue.map(t => taskHtml(t, formatDate(t.due_date))).join('')}</ul>`);
  }

  textLines.push(`Open Cleartable: ${APP_URL}`);
  textLines.push('');
  textLines.push(`Unsubscribe: ${unsubLink}`);

  const text = textLines.join('\n');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a22;line-height:1.6;">
    <p style="margin:0 0 16px;">${esc(hi)}</p>
    <p style="margin:0 0 16px;">Here's what needs your attention today:</p>
    ${htmlParts.join('')}
    <p style="margin:0 0 16px;">
      <a href="${APP_URL}" style="display:inline-block;background:#7c6cff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Open Cleartable</a>
    </p>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
      <a href="${esc(unsubLink)}" style="color:#9ca3af;">Unsubscribe from daily emails</a>
    </p>
  </div>`;

  return { subject, html, text };
}
