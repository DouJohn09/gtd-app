// One row per server self-check (every 5 min, services/heartbeat.js): did the
// database answer, did the public URL (Cloudflare → Railway → app) answer,
// and how fast. Feeds the uptime bar on the founder's Pulse page. Rows older
// than 30 days are pruned by the heartbeat itself.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE heartbeat_checks (
      id SERIAL PRIMARY KEY,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ok BOOLEAN NOT NULL,
      db_ms INTEGER,
      public_ms INTEGER,
      problem TEXT
    );
    CREATE INDEX heartbeat_checks_time ON heartbeat_checks (checked_at);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS heartbeat_checks CASCADE;`);
};
