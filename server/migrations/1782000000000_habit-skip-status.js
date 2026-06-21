// Per-day skip / rest days for habits (anti-guilt slice, backlog P0 #11).
//
// A `habit_logs` row used to mean exactly one thing: "completed on this date".
// We now distinguish a deliberate *rest day* from a completion: skipped due-days
// are neutral — they don't count toward completion and don't break a streak,
// rather than reading as a miss. `status` carries that distinction.
//
// DEFAULT 'done' makes every existing log a completion, which is exactly their
// meaning today, so the migration is a no-op for current data. The CHECK keeps
// the column to the two states the app cycles through.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE habit_logs
      ADD COLUMN status TEXT NOT NULL DEFAULT 'done'
      CHECK (status IN ('done', 'skipped'));
  `);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE habit_logs DROP COLUMN IF EXISTS status;`);
};
