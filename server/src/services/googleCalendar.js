import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db/pool.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function createOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage'
  );
}

async function getUserTokens(userId) {
  const { rows } = await pool.query(
    'SELECT google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry FROM users WHERE id = $1',
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    access_token: row.google_calendar_access_token,
    refresh_token: row.google_calendar_refresh_token,
    expiry_date: row.google_calendar_token_expiry,
  };
}

async function saveUserTokens(userId, tokens) {
  await pool.query(
    'UPDATE users SET google_calendar_access_token = $1, google_calendar_refresh_token = $2, google_calendar_token_expiry = $3 WHERE id = $4',
    [tokens.access_token, tokens.refresh_token, tokens.expiry_date, userId]
  );
}

async function clearUserTokens(userId) {
  await pool.query(
    'UPDATE users SET google_calendar_access_token = NULL, google_calendar_refresh_token = NULL, google_calendar_token_expiry = NULL WHERE id = $1',
    [userId]
  );
}

// What we ask for: read events (to show them and plan around them) and
// manage only calendars this app created (the "Cleartable" calendar).
// The full `calendar` scope is what connections made before 2026-10 hold;
// it still counts for both so those users keep syncing without re-consent.
const SCOPE_BASE = 'https://www.googleapis.com/auth/calendar';
const LEGACY_FULL_SCOPE = SCOPE_BASE;
const READ_SCOPES = [LEGACY_FULL_SCOPE, `${SCOPE_BASE}.readonly`, `${SCOPE_BASE}.events`, `${SCOPE_BASE}.events.readonly`];
const WRITE_SCOPES = [LEGACY_FULL_SCOPE, `${SCOPE_BASE}.app.created`];

// Google's consent screen lists each scope with its own checkbox, unticked
// by default — "connected" can mean connected with one or neither calendar
// permission. Compare whole scope names: a substring check counted
// calendar.readonly as write access.
export function calendarScopeFlags(scopes) {
  const granted = new Set((scopes || '').split(/\s+/).filter(Boolean));
  return {
    read: READ_SCOPES.some(sc => granted.has(sc)),
    write: WRITE_SCOPES.some(sc => granted.has(sc)),
  };
}

// Last failed push per user, shown on the Calendar page so a time block that
// never reached Google isn't a silent no-op. In-memory on purpose: a restart
// forgets it, and the next successful push clears it.
const lastSyncError = new Map();
function recordSyncError(userId, reason) {
  lastSyncError.set(userId, { reason, at: new Date().toISOString() });
}
export function getLastSyncError(userId) {
  return lastSyncError.get(userId) || null;
}

export async function getCalendarStatus(userId) {
  const { rows } = await pool.query(
    `SELECT (google_calendar_refresh_token IS NOT NULL OR google_calendar_access_token IS NOT NULL) AS connected,
            google_calendar_scopes
       FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row?.connected) return { connected: false, read: false, write: false };
  return { connected: true, ...calendarScopeFlags(row.google_calendar_scopes) };
}

export async function exchangeCodeForTokens(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope || null,
  };
}

export async function userHasWriteScope(userId) {
  const { rows } = await pool.query(
    'SELECT google_calendar_scopes FROM users WHERE id = $1',
    [userId]
  );
  return calendarScopeFlags(rows[0]?.google_calendar_scopes).write;
}

async function getValidAccessToken(userId) {
  const tokens = await getUserTokens(userId);
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) return null;

  // Check if token is still valid (with 5-minute buffer)
  const expiryTime = tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : 0;
  const bufferMs = 5 * 60 * 1000;

  if (tokens.access_token && expiryTime > Date.now() + bufferMs) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) return null;

  try {
    const client = createOAuth2Client();
    client.setCredentials({ refresh_token: tokens.refresh_token });
    const { credentials } = await client.refreshAccessToken();
    const newTokens = {
      access_token: credentials.access_token,
      refresh_token: tokens.refresh_token, // keep existing refresh token
      expiry_date: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
    };
    await saveUserTokens(userId, newTokens);
    return credentials.access_token;
  } catch (err) {
    console.error('Failed to refresh Google Calendar token:', err.message);
    await clearUserTokens(userId);
    return null;
  }
}

// Which calendar day a timed event falls on must be resolved in the USER's
// timezone, not the server's: a 01:00 Prague event is 23:00 UTC the previous
// day, and bucketing it server-local (UTC on Railway) would file it under the
// wrong date. All-day events pass a date-only string and skip this.
function formatDateKey(date, timeZone) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (timeZone) {
    try {
      // en-CA renders as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch { /* bad timezone → fall through to server-local */ }
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEvent(event, timeZone) {
  const startDateTime = event.start?.dateTime;
  const startDate = event.start?.date;
  const endDateTime = event.end?.dateTime;
  const allDay = !!startDate;

  const dueDateStr = allDay ? startDate : formatDateKey(new Date(startDateTime), timeZone);

  return {
    id: `gcal-${event.id}`,
    title: event.summary || '(No title)',
    type: 'google_event',
    due_date: dueDateStr,
    start_time: startDateTime || null,
    end_time: endDateTime || null,
    all_day: allDay,
    html_link: event.htmlLink,
    location: event.location || null,
  };
}

function expandMultiDayEvent(event, rangeStart, rangeEnd, timeZone) {
  const startDate = event.start?.date;
  const endDate = event.end?.date;

  if (!startDate || !endDate) return [normalizeEvent(event, timeZone)];

  const entries = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00'); // end date is exclusive

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = formatDateKey(d);
    if (dateKey >= rangeStart && dateKey <= rangeEnd) {
      entries.push({
        id: `gcal-${event.id}-${dateKey}`,
        title: event.summary || '(No title)',
        type: 'google_event',
        due_date: dateKey,
        start_time: null,
        end_time: null,
        all_day: true,
        html_link: event.htmlLink,
        location: event.location || null,
      });
    }
  }
  return entries;
}

export async function getCalendarEvents(userId, startDate, endDate, timeZone) {
  if (!(await getCalendarStatus(userId)).read) return [];
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return [];

  // Anchor to UTC explicitly (…'Z') so the window is server-timezone-independent,
  // and pad a day on each side so it always covers the user's local day whatever
  // their offset. Consumers filter to the exact day (by due_date / minutes-of-day
  // overlap), so the extra edge events are harmless. Without the pad, a UTC server
  // built a window that missed a west-of-UTC user's late-afternoon meetings.
  const timeMin = new Date(startDate + 'T00:00:00Z');
  timeMin.setUTCDate(timeMin.getUTCDate() - 1);
  const timeMax = new Date(endDate + 'T00:00:00Z');
  timeMax.setUTCDate(timeMax.getUTCDate() + 2);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Google Calendar API error:', response.status, error);
    if (response.status === 401) {
      await clearUserTokens(userId);
    }
    return [];
  }

  const data = await response.json();
  const events = data.items || [];

  const normalized = [];
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const expanded = expandMultiDayEvent(event, startDate, endDate, timeZone);
    normalized.push(...expanded);
  }

  return normalized;
}

export async function revokeCalendarAccess(userId) {
  const tokens = await getUserTokens(userId);
  const tokenToRevoke = tokens?.refresh_token || tokens?.access_token;
  if (tokenToRevoke) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenToRevoke}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.error('Failed to revoke Google token:', err.message);
    }
  }
  await clearUserTokens(userId);
}

export async function isCalendarConnected(userId) {
  const tokens = await getUserTokens(userId);
  return !!(tokens?.refresh_token || tokens?.access_token);
}

async function getGtdCalendarId(userId) {
  const { rows } = await pool.query('SELECT gtd_calendar_id FROM users WHERE id = $1', [userId]);
  return rows[0]?.gtd_calendar_id || null;
}

// Claims the slot only if it's still empty, so two racing creators can't both
// win. Returns the id that ended up stored (ours or the one already there).
async function claimGtdCalendarId(userId, id) {
  const { rows } = await pool.query(
    'UPDATE users SET gtd_calendar_id = $1 WHERE id = $2 AND gtd_calendar_id IS NULL RETURNING gtd_calendar_id',
    [id, userId]
  );
  return rows[0]?.gtd_calendar_id || getGtdCalendarId(userId);
}

// Forget a stored calendar we can no longer reach (deleted by the user, or
// created under the old full scope and not visible to calendar.app.created),
// together with event ids that pointed into it, so the next push makes a
// fresh "Cleartable" calendar instead of failing forever.
async function resetGtdCalendar(userId, calendarId) {
  await pool.query('UPDATE users SET gtd_calendar_id = NULL WHERE id = $1 AND gtd_calendar_id = $2', [userId, calendarId]);
  await pool.query('UPDATE tasks SET google_event_id = NULL WHERE user_id = $1 AND google_event_id IS NOT NULL', [userId]);
}

// One-time rename of legacy "GTD Flow" calendars to "Cleartable" after the rebrand.
// Memoized per server process so we don't re-check on every push.
const migratedCalendarCache = new Set();
async function migrateLegacyCalendarName(userId, calendarId, accessToken) {
  if (migratedCalendarCache.has(userId)) return;
  migratedCalendarCache.add(userId);
  try {
    const r = await fetch(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!r.ok) return;
    const data = await r.json();
    if (data.summary === 'GTD Flow') {
      await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: 'Cleartable',
            description: 'Time blocks pushed from Cleartable',
          }),
        }
      );
    }
  } catch (err) {
    console.error('Calendar rename migration failed:', err.message);
  }
}

async function ensureGtdCalendar(userId, accessToken) {
  const existing = await getGtdCalendarId(userId);
  if (existing) {
    migrateLegacyCalendarName(userId, existing, accessToken);
    return existing;
  }
  const response = await fetch(`${CALENDAR_API_BASE}/calendars`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'Cleartable',
      description: 'Time blocks pushed from Cleartable',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create Cleartable calendar: ${response.status} ${err}`);
  }
  const data = await response.json();
  console.log(`[gcal] created Cleartable calendar user=${userId} cal=${data.id}`);
  const stored = await claimGtdCalendarId(userId, data.id);
  if (stored !== data.id) {
    // Another process created one first — drop ours rather than leave a
    // second empty "Cleartable" calendar in the user's Google account.
    fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(data.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(err => console.error('Duplicate calendar cleanup failed:', err.message));
  }
  return stored;
}

function buildEventPayload(task, clientTimezone) {
  const startDate = task.due_date;
  const startTime = task.scheduled_time;
  const duration = task.duration || 60;
  if (!startDate || !startTime) return null;

  const [h, m] = startTime.split(':').map(Number);
  const startMins = h * 60 + (m || 0);
  const endMins = startMins + duration;
  const endH = Math.floor(endMins / 60) % 24;
  const endM = endMins % 60;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const endDate = endMins >= 24 * 60
    ? new Date(new Date(startDate + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
    : startDate;

  const tz = clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary: task.title,
    description: task.notes || undefined,
    start: { dateTime: `${startDate}T${startTime}:00`, timeZone: tz },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone: tz },
  };
}

async function setTaskEventId(taskId, eventId) {
  await pool.query('UPDATE tasks SET google_event_id = $1 WHERE id = $2', [eventId, taskId]);
}

export async function pushTaskToCalendar(userId, task, clientTimezone) {
  if (!task || !task.scheduled_time || !task.due_date) return;
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;
  if (!(await userHasWriteScope(userId))) {
    console.log(`[gcal] skip push user=${userId} task=${task.id}: no write scope`);
    return;
  }

  try {
    const payload = buildEventPayload(task, clientTimezone);
    if (!payload) return;
    let calendarId = await ensureGtdCalendar(userId, accessToken);
    const eventsUrl = (calId) => `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events`;
    const send = (url, method) => fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let r;
    let action = 'create';
    if (task.google_event_id) {
      action = 'update';
      r = await send(`${eventsUrl(calendarId)}/${encodeURIComponent(task.google_event_id)}`, 'PATCH');
      // 404: the event was deleted on Google's side (or its calendar is gone,
      // which the create below finds out) — recreate it.
      if (r.status === 404) { action = 'recreate'; r = await send(eventsUrl(calendarId), 'POST'); }
    } else {
      r = await send(eventsUrl(calendarId), 'POST');
    }

    // 403/404 on the calendar itself: we can't reach the stored "Cleartable"
    // calendar any more. Start a new one once, then requeue upcoming blocks
    // (their event ids pointed into the old calendar).
    if (r.status === 404 || (r.status === 403 && !(await isRateLimit(r)))) {
      console.error(`Cleartable calendar unreachable (${r.status}) — creating a new one for user ${userId}`);
      await resetGtdCalendar(userId, calendarId);
      calendarId = await ensureGtdCalendar(userId, accessToken);
      action = 'create (new calendar)';
      r = await send(eventsUrl(calendarId), 'POST');
      if (r.ok) requeueUpcoming(userId, task.id, clientTimezone);
    }

    if (r.ok) {
      if (action !== 'update') await setTaskEventId(task.id, (await r.json()).id);
      lastSyncError.delete(userId);
      // Calendar id only (no titles): lets us match against Google Calendar →
      // Settings → <calendar> → Calendar ID when a user can't find a block.
      console.log(`[gcal] ${action} ok user=${userId} task=${task.id} date=${task.due_date} ${task.scheduled_time} cal=${calendarId}`);
    } else {
      await handlePushFailure(userId, r, action);
    }
  } catch (err) {
    console.error('pushTaskToCalendar error:', err.message);
    recordSyncError(userId, 'failed');
  }
}

// Google also answers 403 for quota/rate limits; those must not be mistaken
// for "calendar unreachable" (which would spawn a new calendar).
async function isRateLimit(response) {
  try {
    const body = await response.clone().json();
    const reasons = (body?.error?.errors || []).map(e => e.reason);
    return reasons.some(x => /rate|quota|usageLimits/i.test(x || ''));
  } catch {
    return false;
  }
}

function requeueUpcoming(userId, exceptTaskId, clientTimezone) {
  const today = formatDateKey(new Date(), clientTimezone);
  pool.query(
    `SELECT id FROM tasks WHERE user_id = $1 AND id <> $2 AND list <> 'completed'
       AND scheduled_time IS NOT NULL AND due_date >= $3 LIMIT ${BACKFILL_LIMIT}`,
    [userId, exceptTaskId, today]
  ).then(({ rows }) => {
    for (const { id } of rows) {
      syncTaskToCalendar(userId, { id }, clientTimezone).catch(err => console.error('requeueUpcoming:', err.message));
    }
  }).catch(err => console.error('requeueUpcoming:', err.message));
}

// 401 = the user removed Cleartable's access on Google's side. Drop the dead
// tokens so the app shows "Connect Google" instead of claiming it's connected.
async function handlePushFailure(userId, response, action) {
  console.error(`Failed to ${action} Cleartable event:`, response.status, await response.text());
  if (response.status === 401) {
    await clearUserTokens(userId);
    recordSyncError(userId, 'revoked');
  } else {
    recordSyncError(userId, 'failed');
  }
}

async function clearTaskEventId(taskId) {
  await pool.query('UPDATE tasks SET google_event_id = NULL WHERE id = $1', [taskId]);
}

// Per-user promise chain. Callers fire syncs without awaiting (apply-week can
// fire 60 at once); running them in parallel let every one of them see "no
// Cleartable calendar yet" and create its own, and let two syncs of the same
// task both see "no event yet" and create two events. One at a time per user,
// each reading the task fresh, removes both races.
const userSyncQueues = new Map();
function enqueueForUser(userId, job) {
  const prev = userSyncQueues.get(userId) || Promise.resolve();
  const next = prev.then(job, job);
  const tail = next.catch(() => {});
  userSyncQueues.set(userId, tail);
  tail.then(() => {
    if (userSyncQueues.get(userId) === tail) userSyncQueues.delete(userId);
  });
  return next;
}

async function loadTaskForSync(userId, taskId) {
  const { rows } = await pool.query(
    `SELECT id, title, notes, list, due_date, scheduled_time, duration, google_event_id
       FROM tasks WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
  return rows[0] || null;
}

// Sync a task's state to its Google Calendar event.
// Push when task has scheduled_time + due_date and isn't completed.
// Delete when task lost its scheduled_time but still has an event id.
// Skip on completed tasks (event remains as a time log).
// The passed task only identifies which row to sync: by the time a queued job
// runs, the row may have changed (or gained an event id from an earlier job),
// so the job always works from the current DB state.
export function syncTaskToCalendar(userId, task, clientTimezone) {
  if (!task?.id) return Promise.resolve();
  return enqueueForUser(userId, async () => {
    const fresh = await loadTaskForSync(userId, task.id);
    if (fresh) await syncTaskNow(userId, fresh, clientTimezone);
  });
}

// Right after a (re)connect with write access: push every open, time-blocked
// task from today on, so the calendar isn't empty until each one is touched.
// Past blocks stay out. Capped; runs through the per-user queue like any sync.
const BACKFILL_LIMIT = 200;
export async function syncUpcomingTasks(userId, today, clientTimezone) {
  const { rows } = await pool.query(
    `SELECT id FROM tasks
      WHERE user_id = $1 AND list <> 'completed'
        AND scheduled_time IS NOT NULL AND due_date >= $2
      ORDER BY due_date, scheduled_time
      LIMIT ${BACKFILL_LIMIT}`,
    [userId, today]
  );
  for (const { id } of rows) {
    syncTaskToCalendar(userId, { id }, clientTimezone)
      .catch(err => console.error('syncUpcomingTasks:', err.message));
  }
  console.log(`[gcal] backfill user=${userId} from=${today} queued=${rows.length}`);
  return rows.length;
}

async function syncTaskNow(userId, task, clientTimezone) {
  if (task.list === 'completed') return;
  if (task.scheduled_time && task.due_date) {
    await pushTaskToCalendar(userId, task, clientTimezone);
  } else if (task.google_event_id) {
    await deleteTaskFromCalendar(userId, task.google_event_id);
    await clearTaskEventId(task.id);
  }
}

export async function deleteTaskFromCalendar(userId, eventId) {
  if (!eventId) return;
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;
  if (!(await userHasWriteScope(userId))) return;

  try {
    const calendarId = await getGtdCalendarId(userId);
    if (!calendarId) return;
    const r = await fetch(
      `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      console.error('Failed to delete Cleartable event:', r.status, await r.text());
    }
  } catch (err) {
    console.error('deleteTaskFromCalendar error:', err.message);
  }
}
