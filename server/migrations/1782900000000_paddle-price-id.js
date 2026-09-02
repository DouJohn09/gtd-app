// Record which Paddle price a user's subscription was bought at. Needed to
// enforce the founder offer cap ("first 30 buyers"): routes/billing.js counts
// live subscriptions on the founder price before creating another founder
// checkout. Synced from subscription webhooks (items[0].price.id); NULL for
// rows that predate this column (sandbox test subscriptions only).

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN paddle_price_id TEXT;
    CREATE INDEX idx_users_paddle_price_id ON users(paddle_price_id) WHERE paddle_price_id IS NOT NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_users_paddle_price_id;
    ALTER TABLE users DROP COLUMN IF EXISTS paddle_price_id;
  `);
};
