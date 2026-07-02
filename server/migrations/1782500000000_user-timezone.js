// Store each user's IANA timezone so "today" (habit streaks, daily focus,
// deferred tasks, recurrence) is computed in their local day, not the server's
// UTC day. Captured from the browser (X-Client-Timezone) at login. Nullable;
// null falls back to UTC. Durable source of truth for future server-side jobs
// (reminders/digests) that run without a live request.

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN timezone TEXT;`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS timezone;`);
};
