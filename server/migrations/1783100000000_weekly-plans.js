// "Plan my week": one row per user per 7-day window (week_start = the first
// day, today when planned from Calendar or the Weekly Review). `payload` holds
// the AI proposal (placements, unplaced, summary) and, once applied, the
// placements the user actually kept — so a re-plan of the same window upserts
// and the Free-tier gate can count applied weeks per month.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE weekly_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      payload JSONB NOT NULL,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, week_start)
    );
    CREATE INDEX weekly_plans_user_start ON weekly_plans (user_id, week_start);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS weekly_plans CASCADE;`);
};
