// Record what the day planner actually applied, and what became of each block.
//
// daily_plans.payload stores the AI proposal by task *position* in the prompt,
// so once the day is over nobody can say which task sat in which block. This
// table is the fact record: one row per applied block, written by /apply-plan,
// closed out by task completion (outcome 'done'), the evening shutdown
// ('tomorrow' | 'slot' | 'release'), or a same-day re-plan ('replanned').
//
// It feeds two things: the "Plan vs reality" card in Insights, and the
// calibration paragraph the planner gets about this user (how many blocks
// they really finish, at which hours). Nothing here is user-editable.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE plan_blocks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      plan_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      estimate_at_plan INTEGER,
      outcome TEXT CHECK (outcome IN ('done', 'tomorrow', 'slot', 'release', 'replanned')),
      outcome_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_plan_blocks_user_date ON plan_blocks (user_id, plan_date);
    CREATE UNIQUE INDEX idx_plan_blocks_open_task
      ON plan_blocks (user_id, plan_date, task_id) WHERE outcome IS NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS plan_blocks CASCADE;`);
};
