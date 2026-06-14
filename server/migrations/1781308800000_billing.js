// Billing columns on users — the paywall / Pro-tier state (backlog P0 #5).
// Paddle (Merchant of Record) is the source of truth; these columns are a
// local cache synced by the signature-verified webhook in routes/billing.js.
//
// `plan` reflects intent ('pro' once a paid subscription exists), while
// `subscription_status` + `current_period_end` gate actual access — see
// isProActive() in services/billing.js. A canceled/past_due user keeps Pro
// until current_period_end so dunning and end-of-period cancellation behave.
// Defaults make every existing user 'free' with no subscription, which is
// exactly today's behavior (the tier resolver returned 'free' for everyone).

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN paddle_customer_id     TEXT,
      ADD COLUMN paddle_subscription_id TEXT,
      ADD COLUMN plan                   TEXT NOT NULL DEFAULT 'free',
      ADD COLUMN subscription_status    TEXT,
      ADD COLUMN current_period_end     TIMESTAMPTZ;
  `);
  // Look up a user by their Paddle customer id during webhook processing when
  // custom_data isn't present (e.g. some account-level events).
  pgm.sql(`CREATE INDEX idx_users_paddle_customer_id ON users(paddle_customer_id);`);
};

export const down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_users_paddle_customer_id;`);
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS paddle_customer_id,
      DROP COLUMN IF EXISTS paddle_subscription_id,
      DROP COLUMN IF EXISTS plan,
      DROP COLUMN IF EXISTS subscription_status,
      DROP COLUMN IF EXISTS current_period_end;
  `);
};
