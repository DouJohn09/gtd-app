// When a habit happens, so planning and the calendar can account for it.
// Either a fixed start (preferred_time 'HH:MM') or a part of the day
// (time_of_day) the planner finds room in; duration is minutes. All three
// null = "any time", which is how every existing habit stays.
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE habits
      ADD COLUMN time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening')),
      ADD COLUMN preferred_time TEXT CHECK (preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      ADD COLUMN duration INTEGER CHECK (duration BETWEEN 5 AND 480);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE habits DROP COLUMN time_of_day, DROP COLUMN preferred_time, DROP COLUMN duration;
  `);
};
