import { Paddle, Environment, EventName } from '@paddle/paddle-node-sdk';
import { pool } from '../db/pool.js';

// Paddle is our Merchant of Record. We talk to it server-side only for two
// things: creating a checkout transaction (so the user_id is stamped securely,
// not trusted from the browser) and verifying inbound webhooks. Subscription
// state lands in users.* via the webhook — see services/billing.js for how
// "Pro right now" is derived from it.

const apiKey = process.env.PADDLE_API_KEY;
const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
const environment =
  (process.env.PADDLE_ENV || 'sandbox') === 'production'
    ? Environment.production
    : Environment.sandbox;

// Lazy so the app still boots before Paddle is configured (billing stays dormant
// until the env vars exist — the sandbox build can run without them).
let _paddle = null;
export function getPaddle() {
  if (!apiKey) throw new Error('PADDLE_API_KEY is not set');
  if (!_paddle) _paddle = new Paddle(apiKey, { environment });
  return _paddle;
}

export function isPaddleConfigured() {
  return Boolean(apiKey && webhookSecret);
}

// Checkout is only offered to users when Paddle runs in production. The sandbox
// overlay rejects real cards and accepts test ones, so a public Settings page
// must never reach it. PADDLE_ALLOW_SANDBOX_CHECKOUT=1 re-opens it for a
// deliberate end-to-end sandbox test; never set that in production.
export function isCheckoutEnabled() {
  if (!isPaddleConfigured()) return false;
  if (environment === Environment.production) return true;
  return process.env.PADDLE_ALLOW_SANDBOX_CHECKOUT === '1';
}

// Founder offer: the discounted annual price is capped at the first N buyers.
// A "buyer" is anyone whose subscription on the founder price is still live
// (paying, or canceled/paused but inside the period they paid for). A refund
// inside the 30-day window cancels the subscription immediately, which frees
// the slot again.
export const FOUNDER_CAP = Math.max(0, Number(process.env.FOUNDER_CAP) || 30);

export async function founderSpotsLeft() {
  const founderPriceId = process.env.PADDLE_PRICE_FOUNDER;
  if (!founderPriceId) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM users
      WHERE paddle_price_id = $1
        AND plan = 'pro'
        AND (
          subscription_status IN ('active', 'trialing', 'past_due')
          OR (subscription_status IN ('canceled', 'paused') AND current_period_end > NOW())
        )`,
    [founderPriceId]
  );
  return Math.max(0, FOUNDER_CAP - rows[0].cnt);
}

// Verify the signature and parse the event. Throws if the signature is invalid.
export async function unmarshalWebhook(rawBody, signature) {
  if (!webhookSecret) throw new Error('PADDLE_WEBHOOK_SECRET is not set');
  return getPaddle().webhooks.unmarshal(rawBody, webhookSecret, signature);
}

// Create a transaction for Checkout. The client opens Paddle.js with the
// returned transaction id. We set custom_data.user_id here (server-side) so the
// webhook can map the resulting subscription back to the right account — the
// browser never gets to choose whose account is credited.
export async function createCheckoutTransaction({ priceId, userId, customerId }) {
  const body = {
    items: [{ priceId, quantity: 1 }],
    customData: { user_id: String(userId) },
  };
  if (customerId) body.customerId = customerId;
  return getPaddle().transactions.create(body);
}

// Cancel a subscription immediately (used on account deletion so we don't keep
// billing a user whose data is gone). Best-effort: callers should not block
// erasure on Paddle being reachable.
export async function cancelSubscription(subscriptionId) {
  if (!subscriptionId) return;
  await getPaddle().subscriptions.cancel(subscriptionId, { effectiveFrom: 'immediately' });
}

// Map a Paddle subscription entity onto our users row. plan is 'pro' whenever a
// subscription exists; isProActive() gates real access by status + period end,
// so a canceled/past-due user keeps Pro until the period they paid for ends.
async function syncSubscription(sub) {
  const userId = sub.customData?.user_id ?? sub.customData?.userId ?? null;
  // Paddle keeps status='active' after a cancel, attaching a scheduledChange
  // that takes effect at period end. Treat that as 'canceled' so isProActive
  // keeps Pro until current_period_end and the UI shows the "set to cancel" state.
  let status = sub.status; // active | trialing | past_due | paused | canceled
  if (sub.scheduledChange?.action === 'cancel') status = 'canceled';
  const periodEnd = sub.currentBillingPeriod?.endsAt ?? null;
  // Which price this subscription is on — drives the founder cap. Single-item
  // subscriptions only (that's all we sell); keep the existing value if the
  // event carries no items.
  const priceId = sub.items?.[0]?.price?.id ?? null;

  if (userId) {
    await pool.query(
      `UPDATE users
          SET plan = 'pro',
              subscription_status = $1,
              current_period_end = $2,
              paddle_subscription_id = $3,
              paddle_customer_id = COALESCE(paddle_customer_id, $4),
              paddle_price_id = COALESCE($6, paddle_price_id)
        WHERE id = $5`,
      [status, periodEnd, sub.id, sub.customerId, userId, priceId]
    );
  } else if (sub.customerId) {
    await pool.query(
      `UPDATE users
          SET plan = 'pro',
              subscription_status = $1,
              current_period_end = $2,
              paddle_subscription_id = $3,
              paddle_price_id = COALESCE($5, paddle_price_id)
        WHERE paddle_customer_id = $4`,
      [status, periodEnd, sub.id, sub.customerId, priceId]
    );
  } else {
    console.warn('[paddle] subscription event with no user_id or customer_id', sub.id);
  }
  return { userId, status, periodEnd, priceId };
}

// Dispatch a verified event. Subscription lifecycle events drive plan state;
// past_due arrives as a SubscriptionUpdated with status='past_due'. Other
// events (transaction.*, etc.) are ignored for now.
export async function handleWebhookEvent(event) {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
      return syncSubscription(event.data);
    default:
      return null;
  }
}
