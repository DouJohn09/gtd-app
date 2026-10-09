export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE users ADD COLUMN last_daily_email_at DATE;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS last_daily_email_at;
    ALTER TABLE users DROP COLUMN IF EXISTS notification_prefs;
  `);
};
