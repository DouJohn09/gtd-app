// Add 'interval' as a habit frequency — "every N days" scheduling (backlog P2).
//
// N is stored in target_days[0] (same slot weekly uses for its per-week target),
// and due days are anchored to the habit's created_at: anchor, anchor+N, anchor+2N…
// No new column is needed; we only widen the frequency CHECK constraint.
//
// Drop-and-recreate is the only way to alter a CHECK. The original was created
// inline on the column, so Postgres named it `habits_frequency_check` — but rather
// than trust that name, we look up whichever CHECK on `habits` references
// `frequency` and drop it by its real name, then add the widened one.

const dropFrequencyCheck = `
  DO $$
  DECLARE c text;
  BEGIN
    SELECT conname INTO c FROM pg_constraint
      WHERE conrelid = 'habits'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%frequency%';
    IF c IS NOT NULL THEN
      EXECUTE 'ALTER TABLE habits DROP CONSTRAINT ' || quote_ident(c);
    END IF;
  END $$;
`;

export const up = (pgm) => {
  pgm.sql(dropFrequencyCheck);
  pgm.sql(`
    ALTER TABLE habits ADD CONSTRAINT habits_frequency_check
      CHECK (frequency IN ('daily', 'weekly', 'specific_days', 'interval'));
  `);
};

export const down = (pgm) => {
  pgm.sql(dropFrequencyCheck);
  pgm.sql(`
    ALTER TABLE habits ADD CONSTRAINT habits_frequency_check
      CHECK (frequency IN ('daily', 'weekly', 'specific_days'));
  `);
};
