import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  isPaddleConfigured,
  createCheckoutTransaction,
  unmarshalWebhook,
  handleWebhookEvent,
  getPaddle,
} from '../services/paddle.js';
import { getUserPlan } from '../services/billing.js';

const router = Router();

// plan key (from the client) → Paddle price id (from env). Keeping the mapping
// server-side means the browser can't request an arbitrary price.
function priceIdFor(plan) {
  return {
    monthly: process.env.PADDLE_PRICE_PRO_MONTHLY,
    yearly: process.env.PADDLE_PRICE_PRO_YEARLY,
    founder: process.env.PADDLE_PRICE_FOUNDER,
  }[plan];
}

// POST /api/billing/checkout  { plan: 'monthly'|'yearly'|'founder' }
// Creates a transaction stamped with the authenticated user's id and returns
// its id; the client opens Paddle.js with { transactionId }.
router.post('/checkout', async (req, res) => {
  try {
    if (!isPaddleConfigured()) {
      return res.status(503).json({ error: 'Billing is not configured', code: 'billing_unconfigured' });
    }
    const { plan } = req.body || {};
    const priceId = priceIdFor(plan);
    if (!priceId) {
      return res.status(400).json({ error: 'Unknown or unconfigured plan', code: 'bad_plan' });
    }

    // TODO(founder-cap): the founder plan is limited to the first 30 buyers.
    // Enforce here once we record which price a subscription used (count
    // active founder subscriptions and 503 'founder_sold_out' when >= 30).

    const { rows } = await pool.query(
      'SELECT paddle_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const customerId = rows[0]?.paddle_customer_id || undefined;

    const txn = await createCheckoutTransaction({ priceId, userId: req.user.id, customerId });
    res.json({ transactionId: txn.id });
  } catch (error) {
    console.error('[billing] checkout failed:', error);
    res.status(500).json({ error: 'Could not start checkout' });
  }
});

// GET /api/billing/status — current plan state for the client (gating + UI).
router.get('/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT plan, subscription_status, current_period_end FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = rows[0] || {};
    res.json({
      plan: await getUserPlan(req.user.id), // derived 'free' | 'pro'
      rawPlan: u.plan || 'free',
      subscriptionStatus: u.subscription_status || null,
      currentPeriodEnd: u.current_period_end || null,
    });
  } catch (error) {
    console.error('[billing] status failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/billing/portal — a Paddle-hosted manage/cancel session for the user.
// NOTE: verify the SDK method/return shape against your sandbox before relying
// on it in the UI; wrapped defensively so a mismatch fails soft.
router.get('/portal', async (req, res) => {
  try {
    if (!isPaddleConfigured()) {
      return res.status(503).json({ error: 'Billing is not configured', code: 'billing_unconfigured' });
    }
    const { rows } = await pool.query(
      'SELECT paddle_customer_id, paddle_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const customerId = rows[0]?.paddle_customer_id;
    if (!customerId) {
      return res.status(404).json({ error: 'No subscription to manage', code: 'no_customer' });
    }
    const subId = rows[0]?.paddle_subscription_id;
    const session = await getPaddle().customerPortalSessions.create(
      customerId,
      subId ? [subId] : []
    );
    res.json({ url: session?.urls?.general?.overview || null, session });
  } catch (error) {
    console.error('[billing] portal failed:', error);
    res.status(500).json({ error: 'Could not open the billing portal' });
  }
});

export default router;

// ---------------------------------------------------------------------------
// Webhook — mounted separately in index.js with express.raw() (BEFORE the global
// express.json), because signature verification needs the exact raw bytes.
// Public (no auth): Paddle calls it. The signature is the authentication.
// ---------------------------------------------------------------------------
export async function paddleWebhookHandler(req, res) {
  const signature = req.headers['paddle-signature'];
  if (!signature) return res.status(400).send('Missing signature');
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    const event = await unmarshalWebhook(rawBody, signature);
    await handleWebhookEvent(event);
    res.status(200).send('OK');
  } catch (error) {
    // 400 tells Paddle to retry; a verification failure is genuinely bad input.
    console.error('[billing] webhook rejected:', error.message);
    res.status(400).send('Invalid');
  }
}
