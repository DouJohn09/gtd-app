// One row per user per planned day. `payload` stores the AI proposal (plan
// blocks, deferred items, summary) so the evening shutdown can diff against
// it and a re-plan upserts instead of double-counting. `applied_at` set when
// the user accepts. The free tier is gated on COUNT(plan_date) per calendar
// month (see billing.js assertPlanWithinLimit); Pro is unlimited.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE daily_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_date DATE NOT NULL,
      payload JSONB NOT NULL,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, plan_date)
    );
    CREATE INDEX daily_plans_user_month ON daily_plans (user_id, plan_date);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS daily_plans CASCADE;`);
};
