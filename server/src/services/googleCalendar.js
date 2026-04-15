import { OAuth2Client } from 'google-auth-library';
import { getDb, saveDb } from '../db/schema.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

function createOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage'
  );
}

function getUserTokens(userId) {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry FROM users WHERE id = ?'
  );
  stmt.bind([userId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      access_token: row.google_calendar_access_token,
      refresh_token: row.google_calendar_refresh_token,
      expiry_date: row.google_calendar_token_expiry,
    };
  }
  stmt.free();
  return null;
}

function saveUserTokens(userId, tokens) {
  const db = getDb();
  db.run(
    'UPDATE users SET google_calendar_access_token = ?, google_calendar_refresh_token = ?, google_calendar_token_expiry = ? WHERE id = ?',
    [tokens.access_token, tokens.refresh_token, tokens.expiry_date, userId]
  );
  saveDb();
}

function clearUserTokens(userId) {
  const db = getDb();
  db.run(
    'UPDATE users SET google_calendar_access_token = NULL, google_calendar_refresh_token = NULL, google_calendar_token_expiry = NULL WHERE id = ?',
    [userId]
  );
  saveDb();
}

export async function exchangeCodeForTokens(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  };
}

async function getValidAccessToken(userId) {
  const tokens = getUserTokens(userId);
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) return null;

  // Check if token is still valid (with 5-minute buffer)
  const expiryTime = tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : 0;
  const bufferMs = 5 * 60 * 1000;

  if (tokens.access_token && expiryTime > Date.now() + bufferMs) {
    return tokens.access_token;
  }

  // Token expired — try to refresh if we have a refresh token
  if (!tokens.refresh_token) return null;

  try {
    const client = createOAuth2Client();
    client.setCredentials({
      refresh_token: tokens.refresh_token,
    });
    const { credentials } = await client.refreshAccessToken();
    const newTokens = {
      access_token: credentials.access_token,
      refresh_token: tokens.refresh_token, // keep existing refresh token
      expiry_date: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
    };
    saveUserTokens(userId, newTokens);
    return credentials.access_token;
  } catch (err) {
    console.error('Failed to refresh Google Calendar token:', err.message);
    // Token revoked or invalid — clear stored tokens
    clearUserTokens(userId);
    return null;
  }
}

function formatDateKey(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEvent(event) {
  const startDateTime = event.start?.dateTime;
  const startDate = event.start?.date;
  const endDateTime = event.end?.dateTime;
  const endDate = event.end?.date;
  const allDay = !!startDate;

  const dueDateStr = allDay ? startDate : formatDateKey(new Date(startDateTime));

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

function expandMultiDayEvent(event, rangeStart, rangeEnd) {
  const startDate = event.start?.date;
  const endDate = event.end?.date;

  // Only all-day events can span multiple days in this context
  if (!startDate || !endDate) return [normalizeEvent(event)];

  const entries = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00'); // end date is exclusive in Google API

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

export async function getCalendarEvents(userId, startDate, endDate) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return [];

  const timeMin = new Date(startDate + 'T00:00:00').toISOString();
  const timeMax = new Date(endDate + 'T23:59:59').toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
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
      // Token invalid — clear it
      clearUserTokens(userId);
    }
    return [];
  }

  const data = await response.json();
  const events = data.items || [];

  // Normalize and expand multi-day events
  const normalized = [];
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const expanded = expandMultiDayEvent(event, startDate, endDate);
    normalized.push(...expanded);
  }

  return normalized;
}

export async function revokeCalendarAccess(userId) {
  const tokens = getUserTokens(userId);
  // Prefer revoking refresh_token — this revokes all associated tokens
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
  clearUserTokens(userId);
}

export function isCalendarConnected(userId) {
  const tokens = getUserTokens(userId);
  return !!(tokens?.refresh_token || tokens?.access_token);
}
