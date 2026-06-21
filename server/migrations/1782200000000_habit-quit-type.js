// Quit / break habits (backlog P2). A "quit" habit succeeds by abstinence: a
// habit_logs row means a *slip* on that day (status 'slip'), not a completion.
// Streak = consecutive clean days; completion = % of clean days.
//
//   - habits.type: 'build' (the normal do-it habit, today's behavior) | 'quit'.
//     DEFAULT 'build' makes every existing habit unchanged.
//   - habit_logs.status gains 'slip'. The status CHECK was created inline in the
//     P1 migration, so we drop whichever CHECK references `status` by its real
//     (looked-up) name rather than trusting the auto-generated one.

const dropStatusCheck = `
  DO $$
  DECLARE c text;
  BEGIN
    SELECT conname INTO c FROM pg_constraint
      WHERE conrelid = 'habit_logs'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%';
    IF c IS NOT NULL THEN
      EXECUTE 'ALTER TABLE habit_logs DROP CONSTRAINT ' || quote_ident(c);
    END IF;
  END $$;
`;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE habits
      ADD COLUMN type TEXT NOT NULL DEFAULT 'build'
      CHECK (type IN ('build', 'quit'));
  `);
  pgm.sql(dropStatusCheck);
  pgm.sql(`
    ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_status_check
      CHECK (status IN ('done', 'skipped', 'slip'));
  `);
};

export const down = (pgm) => {
  // Drop any 'slip' rows so the narrower CHECK can be re-applied cleanly.
  pgm.sql(`DELETE FROM habit_logs WHERE status = 'slip';`);
  pgm.sql(dropStatusCheck);
  pgm.sql(`
    ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_status_check
      CHECK (status IN ('done', 'skipped'));
  `);
  pgm.sql(`ALTER TABLE habits DROP COLUMN IF EXISTS type;`);
};
