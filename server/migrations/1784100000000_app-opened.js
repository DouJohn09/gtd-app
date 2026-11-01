// When someone first and last opened the app itself (not only the connect
// page an AI app sent them to). People who connect Claude can use Cleartable
// without ever opening it; Pulse shows which ones found the app.
// Backfill: the welcome wizard only runs inside the app, so onboarded_at is a
// safe lower bound for anyone who already finished or skipped it.
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN app_opened_at TIMESTAMPTZ, ADD COLUMN app_last_open_at TIMESTAMPTZ;
    UPDATE users SET app_opened_at = onboarded_at, app_last_open_at = onboarded_at WHERE onboarded_at IS NOT NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN app_opened_at, DROP COLUMN app_last_open_at;`);
};
