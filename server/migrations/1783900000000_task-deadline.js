// A deadline apart from the do-date. due_date stays the day the task is
// planned for (calendar, Today, overdue); deadline is the "by" date it must
// not slip past. Plan my week sets it when it moves a dated task earlier, so
// "by Friday" survives being planned on Tuesday. Null = the due date is the
// deadline, which is how every existing task stays.
export const up = (pgm) => {
  pgm.sql(`ALTER TABLE tasks ADD COLUMN deadline DATE;`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE tasks DROP COLUMN deadline;`);
};
