// OAuth 2.1 authorization server behind the MCP endpoint. The SDK's handlers
// (/authorize, /token, /register, /revoke) do the protocol and PKCE checks;
// this provider stores clients, sign-in requests, grants and tokens.
//
// Sign-in reuses the app: /authorize parks the request and sends the browser
// to /app/connect, where the user (signed in the normal way) sees which app
// is asking and clicks Allow. That mints a one-time code bound to the user.
import { createHash, randomBytes } from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { pool } from '../db/pool.js';
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const isProd = process.env.NODE_ENV === 'production';
export const PUBLIC_URL = (process.env.PUBLIC_URL || (isProd ? 'https://cleartable.app' : `http://localhost:${process.env.PORT || 3001}`)).replace(/\/$/, '');
export const MCP_URL = `${PUBLIC_URL}/mcp`;
export const ISSUER = new URL(PUBLIC_URL).href;   // as the metadata spells it, trailing slash included
const APP_URL = (process.env.APP_URL || (isProd ? 'https://cleartable.app/app' : 'http://localhost:5173')).replace(/\/$/, '');

export const SCOPES = ['tasks'];
const REQUEST_TTL_MIN = 30;        // time to sign in and click Allow
const CODE_TTL_SEC = 120;
const ACCESS_TTL_SEC = 60 * 60;
const REFRESH_TTL_DAYS = 60;       // renewed on every refresh, so active use never expires

const hash = (s) => createHash('sha256').update(s).digest('hex');
const secret = (prefix) => `${prefix}_${randomBytes(32).toString('base64url')}`;

// Client ID Metadata Documents: a client may skip /register and use an https
// URL as its client_id; the JSON at that URL describes it (Smithery works
// this way, Claude prefers it). The document is fetched with guards against
// internal addresses, then kept in oauth_clients like a registered client
// (grants reference that table) and refetched once a day.
const CIMD_MAX_BYTES = 10_000;
const CIMD_TTL_MS = 24 * 60 * 60_000;

const isPrivateAddress = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
};

const isMetadataUrl = (clientId) => {
  try {
    const u = new URL(clientId);
    return u.protocol === 'https:' && u.pathname !== '/' && !u.hash && !u.username && !u.password;
  } catch { return false; }
};

async function fetchClientMetadata(clientId) {
  const url = new URL(clientId);
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) return null;
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const text = await res.text();
  if (text.length > CIMD_MAX_BYTES) return null;
  const doc = JSON.parse(text);
  const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter(u => typeof u === 'string') : [];
  const method = doc.token_endpoint_auth_method || 'none';
  // Public clients only: we hold no keys to check private_key_jwt with.
  if (doc.client_id !== clientId || !redirects.length || method !== 'none') return null;
  return {
    client_id: clientId,
    client_name: typeof doc.client_name === 'string' ? doc.client_name.slice(0, 100) : url.hostname,
    client_uri: typeof doc.client_uri === 'string' ? doc.client_uri : undefined,
    redirect_uris: redirects,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    metadata_document: true,
    fetched_at: Date.now(),
  };
}

const clientsStore = {
  async getClient(clientId) {
    const { rows } = await pool.query('SELECT info FROM oauth_clients WHERE client_id = $1', [clientId]);
    const known = rows[0]?.info;
    if (!isMetadataUrl(clientId)) return known;
    if (known && Date.now() - (known.fetched_at || 0) < CIMD_TTL_MS) return known;
    try {
      const info = await fetchClientMetadata(clientId);
      if (!info) return known;
      await pool.query(
        `INSERT INTO oauth_clients (client_id, info) VALUES ($1, $2)
         ON CONFLICT (client_id) DO UPDATE SET info = EXCLUDED.info`,
        [clientId, info]
      );
      return info;
    } catch (err) {
      console.error('[oauth] client metadata fetch failed:', clientId, err.message);
      return known;
    }
  },
  async registerClient(client) {
    await pool.query('INSERT INTO oauth_clients (client_id, info) VALUES ($1, $2)', [client.client_id, client]);
    return client;
  },
};

async function issueTokens(grantId, scopes) {
  const access = secret('ct_at');
  const refresh = secret('ct_rt');
  await pool.query(
    `INSERT INTO oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES
       ($1, $3, 'access', NOW() + make_interval(secs => $4)),
       ($2, $3, 'refresh', NOW() + make_interval(days => $5))`,
    [hash(access), hash(refresh), grantId, ACCESS_TTL_SEC, REFRESH_TTL_DAYS]
  );
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope: scopes.join(' ') };
}

export const oauthProvider = {
  clientsStore,

  async authorize(client, params, res) {
    const id = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO oauth_requests (id_hash, client_id, params, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))`,
      [hash(id), client.client_id, {
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state ?? null,
        scopes: params.scopes?.length ? params.scopes : SCOPES,
        resource: params.resource?.href ?? null,
      }, REQUEST_TTL_MIN]
    );
    res.redirect(302, `${APP_URL}/connect?request=${encodeURIComponent(id)}`);
  },

  async challengeForAuthorizationCode(client, code) {
    const { rows } = await pool.query(
      `SELECT params FROM oauth_requests
       WHERE code_hash = $1 AND client_id = $2 AND used_at IS NULL AND code_expires_at > NOW()`,
      [hash(code), client.client_id]
    );
    if (!rows[0]) throw new InvalidGrantError('Invalid or expired authorization code');
    return rows[0].params.codeChallenge;
  },

  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    // Marking the code used in the same statement makes it single-use even
    // under two concurrent token requests.
    const { rows } = await pool.query(
      `UPDATE oauth_requests SET used_at = NOW()
       WHERE code_hash = $1 AND client_id = $2 AND used_at IS NULL AND code_expires_at > NOW()
       RETURNING user_id, params`,
      [hash(code), client.client_id]
    );
    const req = rows[0];
    if (!req) throw new InvalidGrantError('Invalid or expired authorization code');
    if (redirectUri && redirectUri !== req.params.redirectUri) throw new InvalidGrantError('redirect_uri does not match');
    if (resource && req.params.resource && resource.href !== req.params.resource) throw new InvalidGrantError('resource does not match');
    const scopes = req.params.scopes;
    const { rows: [grant] } = await pool.query(
      `INSERT INTO oauth_grants (user_id, client_id, scopes, resource, last_used_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [req.user_id, client.client_id, scopes, req.params.resource || MCP_URL]
    );
    return issueTokens(grant.id, scopes);
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    // Rotation: the presented refresh token dies here and a new pair is
    // issued. A reused (already rotated) token gets invalid_grant.
    const { rows } = await pool.query(
      `UPDATE oauth_tokens t SET revoked_at = NOW()
       FROM oauth_grants g
       WHERE t.token_hash = $1 AND t.kind = 'refresh' AND t.revoked_at IS NULL AND t.expires_at > NOW()
         AND g.id = t.grant_id AND g.client_id = $2 AND g.revoked_at IS NULL
       RETURNING g.id, g.scopes`,
      [hash(refreshToken), client.client_id]
    );
    const grant = rows[0];
    if (!grant) throw new InvalidGrantError('Invalid or expired refresh token');
    if (scopes?.some(s => !grant.scopes.includes(s))) throw new InvalidRequestError('Cannot widen scope on refresh');
    // Expired access tokens of this grant are dead weight; drop them.
    await pool.query(`DELETE FROM oauth_tokens WHERE grant_id = $1 AND (expires_at < NOW() OR revoked_at IS NOT NULL)`, [grant.id]);
    return issueTokens(grant.id, grant.scopes);
  },

  async verifyAccessToken(token) {
    const { rows } = await pool.query(
      `SELECT g.id AS grant_id, g.user_id, g.client_id, g.scopes, g.resource, t.expires_at,
              (g.last_used_at IS NULL OR g.last_used_at < NOW() - INTERVAL '5 minutes') AS stale
       FROM oauth_tokens t JOIN oauth_grants g ON g.id = t.grant_id
       WHERE t.token_hash = $1 AND t.kind = 'access' AND t.revoked_at IS NULL
         AND t.expires_at > NOW() AND g.revoked_at IS NULL`,
      [hash(token)]
    );
    const row = rows[0];
    if (!row) throw new InvalidTokenError('Invalid or expired access token');
    if (row.stale) pool.query('UPDATE oauth_grants SET last_used_at = NOW() WHERE id = $1', [row.grant_id]).catch(() => {});
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes,
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
      resource: row.resource ? new URL(row.resource) : undefined,
      extra: { userId: row.user_id, grantId: row.grant_id },
    };
  },

  async revokeToken(client, { token }) {
    // Revoking either token of a grant ends the whole connection, which is
    // what a client means when it signs out.
    await pool.query(
      `UPDATE oauth_grants g SET revoked_at = NOW()
       FROM oauth_tokens t
       WHERE t.token_hash = $1 AND g.id = t.grant_id AND g.client_id = $2 AND g.revoked_at IS NULL`,
      [hash(token), client.client_id]
    );
  },
};

// ---- Used by the /app/connect page (signed-in user) ----

async function openRequest(id) {
  const { rows } = await pool.query(
    `SELECT r.client_id, r.params, c.info FROM oauth_requests r
     JOIN oauth_clients c ON c.client_id = r.client_id
     WHERE r.id_hash = $1 AND r.expires_at > NOW() AND r.code_hash IS NULL`,
    [hash(String(id || ''))]
  );
  return rows[0] || null;
}

const hostOf = (uri) => { try { return new URL(uri).host; } catch { return null; } };

// What the consent screen shows: the app's self-declared name, and the host
// the browser will be sent back to (the part a fake "Claude" can't fake).
export async function describeRequest(id) {
  const r = await openRequest(id);
  if (!r) return null;
  return {
    clientName: r.info.client_name || hostOf(r.params.redirectUri) || 'An AI app',
    redirectHost: hostOf(r.params.redirectUri),
  };
}

function redirectWith(params, query) {
  const url = new URL(params.redirectUri);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (params.state) url.searchParams.set('state', params.state);
  url.searchParams.set('iss', ISSUER);   // RFC 9207: says which server answered
  return url.href;
}

export async function approveRequest(id, userId) {
  const code = randomBytes(32).toString('base64url');
  const { rows } = await pool.query(
    `UPDATE oauth_requests SET user_id = $2, code_hash = $3, code_expires_at = NOW() + make_interval(secs => $4)
     WHERE id_hash = $1 AND expires_at > NOW() AND code_hash IS NULL
     RETURNING params`,
    [hash(String(id || '')), userId, hash(code), CODE_TTL_SEC]
  );
  if (!rows[0]) return null;
  return redirectWith(rows[0].params, { code });
}

export async function denyRequest(id) {
  const { rows } = await pool.query(
    `DELETE FROM oauth_requests WHERE id_hash = $1 AND code_hash IS NULL RETURNING params`,
    [hash(String(id || ''))]
  );
  if (!rows[0]) return null;
  return redirectWith(rows[0].params, { error: 'access_denied', error_description: 'The user declined' });
}

// ---- Settings → Connected apps ----

export async function listConnections(userId) {
  const { rows } = await pool.query(
    `SELECT g.client_id, MAX(c.info->>'client_name') AS name, MIN(g.created_at) AS connected_at, MAX(g.last_used_at) AS last_used_at
     FROM oauth_grants g JOIN oauth_clients c ON c.client_id = g.client_id
     WHERE g.user_id = $1 AND g.revoked_at IS NULL
     GROUP BY g.client_id ORDER BY MAX(g.last_used_at) DESC NULLS LAST`,
    [userId]
  );
  return rows.map(r => ({ clientId: r.client_id, name: r.name || 'AI app', connectedAt: r.connected_at, lastUsedAt: r.last_used_at }));
}

export async function disconnect(userId, clientId) {
  const { rowCount } = await pool.query(
    'UPDATE oauth_grants SET revoked_at = NOW() WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL',
    [userId, clientId]
  );
  return rowCount > 0;
}

// Stale sign-in attempts and dead tokens; called from the MCP router now and then.
export async function pruneOAuth() {
  await pool.query(`DELETE FROM oauth_requests WHERE expires_at < NOW() - INTERVAL '1 day'`);
  await pool.query(`DELETE FROM oauth_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`);
}
