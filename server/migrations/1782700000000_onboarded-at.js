// Server-side "has seen the welcome onboarding" flag, replacing the
// per-device localStorage 'ct_tour_dismissed' key so the wizard shows exactly
// once per account, ever, regardless of device. Existing users are backfilled
// to NOW() — they already know the app (and saw the old inline tour); only
// accounts created after this deploy get the full-screen welcome.

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;`);
  pgm.sql(`UPDATE users SET onboarded_at = NOW();`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at;`);
};
