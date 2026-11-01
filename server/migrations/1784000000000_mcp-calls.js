// One row per JSON-RPC message an AI app sends to /mcp, so we can tell
// "connected and never used" from "reads the day every morning". Only the
// method, the tool name and the outcome; never arguments or task text.
//   method — initialize, tools/list, tools/call, notifications/…
//   tool   — set for tools/call
//   ok     — false when the HTTP answer was 4xx/5xx or the tool returned isError
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE mcp_calls (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      grant_id INTEGER REFERENCES oauth_grants(id) ON DELETE SET NULL,
      method TEXT NOT NULL,
      tool TEXT,
      ok BOOLEAN NOT NULL,
      http_status SMALLINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_mcp_calls_user ON mcp_calls (user_id, created_at DESC);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS mcp_calls;`);
};
