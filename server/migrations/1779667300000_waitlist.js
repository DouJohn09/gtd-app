// Pre-launch waitlist captured from the landing page form.
// One row per email. `source` distinguishes which form on the page captured
// the signup ('hero' / 'bottom-cta') for conversion analysis.
// `unsubscribed_at` is filled by a future unsubscribe link rather than
// hard-deleting rows — keeps the historic signal intact.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      unsubscribed_at TIMESTAMPTZ
    );
  `);
  pgm.sql(`CREATE INDEX idx_waitlist_created ON waitlist(created_at DESC);`);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS waitlist CASCADE;`);
};
