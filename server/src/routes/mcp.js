// Remote MCP server at /mcp plus the OAuth endpoints AI apps use to connect.
// Mounted at the app root (before the landing/SPA fallbacks), because OAuth
// discovery lives at fixed root paths (/.well-known/…, /authorize, /token…).
import express, { Router } from 'express';
import cors from 'cors';
import net from 'net';
import { ipKeyGenerator } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createOAuthMetadata, mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { requireAuth } from '../middleware/auth.js';
import {
  oauthProvider, PUBLIC_URL, MCP_URL, SCOPES,
  describeRequest, approveRequest, denyRequest, listConnections, disconnect, pruneOAuth,
} from '../services/oauth.js';
import { buildMcpServer, userClock } from '../services/mcpServer.js';
import { serverError } from '../lib/httpErrors.js';

const router = Router();

// Claude, ChatGPT and Grok call /token and /register from their own servers,
// so one IP stands for many users; limits are per real client IP but roomy.
const clientIp = (req) => {
  const cf = req.get('CF-Connecting-IP');
  return ipKeyGenerator(cf && net.isIP(cf) ? cf : req.ip);
};
const limit = (max, windowMs) => ({ max, windowMs, keyGenerator: clientIp });

const oauthMetadata = {
  ...createOAuthMetadata({ provider: oauthProvider, issuerUrl: new URL(PUBLIC_URL), scopesSupported: SCOPES }),
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: true,
};

// Some clients send client credentials as HTTP Basic; the SDK reads them from
// the form body only.
function basicClientAuth(req, _res, next) {
  const h = req.headers.authorization;
  if (h?.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(h.slice(6), 'base64').toString().split(':').map(decodeURIComponent);
    req.body = { ...req.body, client_id: req.body?.client_id ?? id, client_secret: req.body?.client_secret ?? secret };
  }
  next();
}

router.use(mcpAuthMetadataRouter({
  oauthMetadata,
  resourceServerUrl: new URL(MCP_URL),
  scopesSupported: SCOPES,
  resourceName: 'Cleartable',
}));
router.use('/authorize', authorizationHandler({ provider: oauthProvider, rateLimit: limit(60, 15 * 60_000) }));
router.use('/token', express.urlencoded({ extended: false }), basicClientAuth, tokenHandler({ provider: oauthProvider, rateLimit: limit(600, 15 * 60_000) }));
router.use('/register', clientRegistrationHandler({
  clientsStore: oauthProvider.clientsStore,
  clientSecretExpirySeconds: 0,           // registered secrets don't expire
  rateLimit: limit(60, 60 * 60_000),
}));
router.use('/revoke', revocationHandler({ provider: oauthProvider, rateLimit: limit(100, 15 * 60_000) }));

// Proves to the official MCP Registry that we own cleartable.app, so the
// server can be listed as app.cleartable/cleartable. Public key only; the
// private half stays with the person who publishes.
router.get('/.well-known/mcp-registry-auth', (_req, res) => {
  res.type('text/plain').send('v=MCPv1; k=ed25519; p=FIMz3uiC8+d0asUpoJ+/rZewPOwp5R5LxrRQi3F/Jes=');
});

// ---- The MCP endpoint ----

const bearer = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(MCP_URL)),
});
const mcpCors = cors({ origin: true, exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'Mcp-Protocol-Version'] });

let lastPrune = 0;

// Stateless: every POST builds a server for the token's user and answers it.
// No sessions to keep, so any Railway instance can serve any call.
router.post('/mcp', mcpCors, bearer, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { userId } = req.auth.extra;
    const clock = await userClock(userId);
    const server = buildMcpServer({ userId, ...clock });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    if (Date.now() - lastPrune > 6 * 3600_000) {
      lastPrune = Date.now();
      pruneOAuth().catch(err => console.error('[oauth] prune failed:', err.message));
    }
  } catch (error) {
    console.error('[mcp] request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});
router.options('/mcp', mcpCors);
router.all('/mcp', mcpCors, (req, res) => {
  res.set('Allow', 'POST').status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
});

// ---- The consent page (/app/connect) and Settings → Connected apps ----

router.get('/api/oauth/requests/:id', requireAuth, async (req, res) => {
  try {
    const info = await describeRequest(req.params.id);
    if (!info) return res.status(404).json({ error: 'This connection request has expired. Start again from the AI app.' });
    res.json(info);
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/api/oauth/requests/:id/approve', requireAuth, async (req, res) => {
  try {
    const redirect = await approveRequest(req.params.id, req.user.id);
    if (!redirect) return res.status(404).json({ error: 'This connection request has expired. Start again from the AI app.' });
    res.json({ redirect });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.post('/api/oauth/requests/:id/deny', requireAuth, async (req, res) => {
  try {
    res.json({ redirect: await denyRequest(req.params.id) });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.get('/api/oauth/connections', requireAuth, async (req, res) => {
  try {
    res.json({ connections: await listConnections(req.user.id), mcpUrl: MCP_URL });
  } catch (error) {
    serverError(req, res, error);
  }
});

router.delete('/api/oauth/connections/:clientId', requireAuth, async (req, res) => {
  try {
    const ok = await disconnect(req.user.id, req.params.clientId);
    if (!ok) return res.status(404).json({ error: 'Not connected' });
    res.status(204).send();
  } catch (error) {
    serverError(req, res, error);
  }
});

export default router;
