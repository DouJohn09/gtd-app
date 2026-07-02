// GDPR account deletion (Art. 17): the user_id FKs on every user-scoped table
// were created with NO ACTION, so `DELETE FROM users` failed on FK violations —
// erasure was impossible without hand-deleting every child table in order.
// Re-create each constraint with ON DELETE CASCADE so deleting a user atomically
// removes all their data. (ai_usage already cascaded.) waitlist has no user_id.

const TABLES = [
  'projects',
  'tasks',
  'contexts',
  'habits',
  'habit_logs',
  'weekly_reviews',
  'custom_lists',
  'list_items',
];

export const up = (pgm) => {
  for (const t of TABLES) {
    pgm.sql(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${t}_user_id_fkey;`);
    pgm.sql(`ALTER TABLE ${t} ADD CONSTRAINT ${t}_user_id_fkey
             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;`);
  }
};

export const down = (pgm) => {
  for (const t of TABLES) {
    pgm.sql(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${t}_user_id_fkey;`);
    pgm.sql(`ALTER TABLE ${t} ADD CONSTRAINT ${t}_user_id_fkey
             FOREIGN KEY (user_id) REFERENCES users(id);`);
  }
};
