// Optional per-log note (backlog P2) — jot context on a day, e.g. "ran 5k" on a
// done day or "stressful week" on a slip. Attaches to the habit_logs row, so it
// lives and dies with that day's log. Nullable; existing logs get NULL.

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE habit_logs ADD COLUMN note TEXT;`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE habit_logs DROP COLUMN IF EXISTS note;`);
};
