// Per-user daily AI-call counter — the cost-control / metering layer behind the
// Free/Pro tiers (backlog P0 #4). One row per (user, UTC day); `count` increments
// on every metered AI call. Daily reset is implicit: a new day is a new row, so
// no reset job is needed and history is preserved (useful for calibrating the
// free-tier cap and for the analytics dashboard, #8).
//
// Enforcement (the soft cap) is configured via AI_DAILY_LIMIT_FREE / _PRO env
// vars and stays OFF (unlimited) by default — we count first, observe real usage,
// then set a cap at launch so no existing user is throttled on deploy.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ai_usage (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_date DATE    NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, usage_date)
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ai_usage CASCADE;`);
};
