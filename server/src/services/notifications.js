import { pool } from '../db/pool.js';
import { sendEmail } from './email.js';
import { captureError } from '../lib/observability.js';
import { todayInTz } from '../lib/dateTime.js';
import { getCalendarEvents } from './googleCalendar.js';
import crypto from 'crypto';

// Runs every heartbeat tick (5 min). For each user whose timezone matches
// their chosen delivery hour and who hasn't had today's email yet, builds a
// digest of due/overdue/upcoming tasks + calendar events, then sends via
// Resend. Skips users who opted out or have nothing to show.

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
    delivery_hour: Number.isFinite(d.delivery_hour) ? d.delivery_hour : 8,
    include_due_today: d.include_due_today !== false,
    include_overdue: d.include_overdue !== false,
    include_upcoming: d.include_upcoming === true,
    include_calendar: d.include_calendar === true,
  };
}

function isDeliveryWindow(tz, targetHour) {
  try {
    const hour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const h = parseInt(hour, 10);
    return h >= targetHour - 1 && h <= targetHour;
  } catch {
    return false;
  }
}

export async function runNotificationCycle() {
  let sent = 0;
  try {
    const { rows: users } = await pool.query(`
      SELECT id, email, name, timezone, notification_prefs, last_daily_email_at,
             google_calendar_access_token, google_calendar_refresh_token
      FROM users
      WHERE timezone IS NOT NULL
    `);

    for (const user of users) {
      try {
        const prefs = getNotifPrefs(user.notification_prefs);
        if (!prefs.daily_email) continue;

        if (!isDeliveryWindow(user.timezone, prefs.delivery_hour)) continue;

        const userToday = todayInTz(user.timezone);
        if (user.last_daily_email_at && user.last_daily_email_at.toISOString().slice(0, 10) >= userToday) continue;

        const sections = {};

        if (prefs.include_due_today) {
          const { rows } = await pool.query(`
            SELECT title, due_date, priority, list
            FROM tasks
            WHERE user_id = $1
              AND list NOT IN ('completed', 'someday_maybe')
              AND due_date = $2::date
            ORDER BY priority DESC, title ASC
            LIMIT 15
          `, [user.id, userToday]);
          if (rows.length > 0) sections.today = rows;
        }

        if (prefs.include_overdue) {
          const { rows } = await pool.query(`
            SELECT title, due_date, priority, list
            FROM tasks
            WHERE user_id = $1
              AND list NOT IN ('completed', 'someday_maybe')
              AND due_date < $2::date
            ORDER BY due_date ASC, priority DESC
            LIMIT 10
          `, [user.id, userToday]);
          if (rows.length > 0) sections.overdue = rows;
        }

        if (prefs.include_upcoming) {
          const upcoming3 = new Date(userToday);
          upcoming3.setDate(upcoming3.getDate() + 3);
          const upTo = upcoming3.toISOString().slice(0, 10);
          const { rows } = await pool.query(`
            SELECT title, due_date, priority, list
            FROM tasks
            WHERE user_id = $1
              AND list NOT IN ('completed', 'someday_maybe')
              AND due_date > $2::date
              AND due_date <= $3::date
            ORDER BY due_date ASC, priority DESC
            LIMIT 10
          `, [user.id, userToday, upTo]);
          if (rows.length > 0) sections.upcoming = rows;
        }

        if (prefs.include_calendar && user.google_calendar_refresh_token) {
          try {
            const events = await getCalendarEvents(user.id, userToday, userToday, user.timezone);
            const filtered = events
              .filter(e => e.due_date === userToday && e.title)
              .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
            if (filtered.length > 0) sections.calendar = filtered.slice(0, 10);
          } catch (err) {
            console.warn(`[notifications] calendar fetch failed for user ${user.id}:`, err.message);
          }
        }

        const hasContent = Object.keys(sections).length > 0;
        if (!hasContent) {
          await pool.query('UPDATE users SET last_daily_email_at = $1 WHERE id = $2', [userToday, user.id]);
          continue;
        }

        const firstName = (user.name || '').trim().split(/\s+/)[0] || '';
        const unsubLink = `${BASE_URL}/api/notifications/unsubscribe?u=${user.id}&t=${unsubToken(user.id)}`;

        const { subject, html, text } = buildDailyEmail({ firstName, sections, unsubLink });
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
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
}

function formatTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

function buildDailyEmail({ firstName, sections, unsubLink }) {
  const hi = firstName ? `Hi ${firstName},` : 'Hi,';
  const counts = [];
  if (sections.today) counts.push(`${sections.today.length} due today`);
  if (sections.overdue) counts.push(`${sections.overdue.length} overdue`);
  if (sections.upcoming) counts.push(`${sections.upcoming.length} upcoming`);
  if (sections.calendar) counts.push(`${sections.calendar.length} event${sections.calendar.length !== 1 ? 's' : ''}`);

  const subject = counts.join(' · ') || 'Your daily summary';

  const taskHtml = (t, label) => {
    const prio = t.priority >= 2
      ? ' <span style="color:#ef4444;font-weight:600">!!</span>'
      : t.priority === 1
        ? ' <span style="color:#f59e0b;font-weight:600">!</span>'
        : '';
    const tag = label ? `<span style="color:#9ca3af;font-size:12px;">${esc(label)}</span> ` : '';
    return `<li style="margin:4px 0;">${tag}${esc(t.title)}${prio}</li>`;
  };

  const taskLine = (t, label) => {
    const prio = t.priority >= 2 ? ' !!' : t.priority === 1 ? ' !' : '';
    return `${label ? `[${label}] ` : ''}${t.title}${prio}`;
  };

  let textLines = [hi, ''];
  let htmlParts = [];

  if (sections.today) {
    const n = sections.today.length;
    textLines.push(`Due today (${n}):`);
    sections.today.forEach(t => textLines.push(`  - ${taskLine(t)}`));
    textLines.push('');
    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#7c6cff;">Due today (${n})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${sections.today.map(t => taskHtml(t)).join('')}</ul>`);
  }

  if (sections.overdue) {
    const n = sections.overdue.length;
    textLines.push(`Overdue (${n}):`);
    sections.overdue.forEach(t => textLines.push(`  - ${taskLine(t, formatDate(t.due_date))}`));
    textLines.push('');
    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#ef4444;">Overdue (${n})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${sections.overdue.map(t => taskHtml(t, formatDate(t.due_date))).join('')}</ul>`);
  }

  if (sections.upcoming) {
    const n = sections.upcoming.length;
    textLines.push(`Coming up (${n}):`);
    sections.upcoming.forEach(t => textLines.push(`  - ${taskLine(t, formatDate(t.due_date))}`));
    textLines.push('');
    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#f59e0b;">Coming up (${n})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${sections.upcoming.map(t => taskHtml(t, formatDate(t.due_date))).join('')}</ul>`);
  }

  if (sections.calendar) {
    const n = sections.calendar.length;
    textLines.push(`Today's calendar (${n}):`);
    sections.calendar.forEach(e => {
      const time = e.all_day ? 'all day' : `${formatTime(e.start_time)}–${formatTime(e.end_time)}`;
      textLines.push(`  - ${time}: ${e.title}`);
    });
    textLines.push('');
    htmlParts.push(`<p style="margin:0 0 6px;font-weight:600;color:#38bdf8;">Today's calendar (${n})</p>`);
    htmlParts.push(`<ul style="margin:0 0 16px;padding-left:18px;">${sections.calendar.map(e => {
      const time = e.all_day ? 'all day' : `${formatTime(e.start_time)}–${formatTime(e.end_time)}`;
      return `<li style="margin:4px 0;"><span style="color:#9ca3af;font-size:12px;">${esc(time)}</span> ${esc(e.title)}</li>`;
    }).join('')}</ul>`);
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
