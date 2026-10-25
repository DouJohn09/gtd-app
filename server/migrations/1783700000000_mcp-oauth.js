// OAuth for the MCP server, so Claude, ChatGPT and Grok can act on a user's
// tasks. Cleartable is its own authorization server:
//   oauth_clients   — AI apps that registered themselves (dynamic registration)
//   oauth_requests  — one sign-in attempt: created at /authorize, approved by
//                     the user on /app/connect, which mints a one-time code
//   oauth_grants    — "Claude may use my Cleartable"; what Settings lists and
//                     what Disconnect revokes
//   oauth_tokens    — access and refresh tokens of a grant, stored only as
//                     SHA-256 hashes, like login_codes
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE oauth_clients (
      client_id TEXT PRIMARY KEY,
      info JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE oauth_requests (
      id_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      params JSONB NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT UNIQUE,
      code_expires_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE oauth_grants (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      resource TEXT,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_oauth_grants_user ON oauth_grants (user_id) WHERE revoked_at IS NULL;

    CREATE TABLE oauth_tokens (
      token_hash TEXT PRIMARY KEY,
      grant_id INTEGER NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_oauth_tokens_grant ON oauth_tokens (grant_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS oauth_tokens;
    DROP TABLE IF EXISTS oauth_grants;
    DROP TABLE IF EXISTS oauth_requests;
    DROP TABLE IF EXISTS oauth_clients;
  `);
};
