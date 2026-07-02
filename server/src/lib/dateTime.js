// Current calendar date (YYYY-MM-DD) in a given IANA timezone. Used everywhere
// "today" matters — habit streaks, daily focus, deferred tasks, recurrence — so
// a user's day rolls over at their local midnight, not the server's (UTC).
// Invalid/missing tz falls back to UTC.
export function todayInTz(tz) {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// True if a string is a valid IANA timezone id we can format with.
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
