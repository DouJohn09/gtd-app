// Sign-in by emailed one-time code, for people without (or not wanting to use)
// a Google account. Such users have no google_id; email stays the unique
// identity. One login_codes row per request: the 6-digit code and the link
// token are stored only as SHA-256 hashes.
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

    CREATE TABLE login_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_login_codes_email ON login_codes (email, created_at DESC);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS login_codes;
    DROP INDEX IF EXISTS idx_users_email_lower;
    ALTER TABLE users ALTER COLUMN google_id SET NOT NULL;
  `);
};
