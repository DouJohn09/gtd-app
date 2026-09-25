// Operational events for the founder's monitoring page (GET /api/internal/pulse):
// server 500s, client crash reports and support inquiries, one row each.
// Deliberately content-free — kind, a short label (route / error name /
// masked sender + subject) and a time — so the pulse can count and list them
// without holding anyone's data. Rows older than 90 days are pruned by the
// pulse itself.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ops_events (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('server_error', 'client_error', 'inquiry')),
      label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX ops_events_kind_time ON ops_events (kind, created_at);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ops_events CASCADE;`);
};
