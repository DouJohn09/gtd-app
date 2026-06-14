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

// Map a Paddle subscription entity onto our users row. plan is 'pro' whenever a
// subscription exists; isProActive() gates real access by status + period end,
// so a canceled/past-due user keeps Pro until the period they paid for ends.
async function syncSubscription(sub) {
  const userId = sub.customData?.user_id ?? sub.customData?.userId ?? null;
  const status = sub.status; // active | trialing | past_due | paused | canceled
  const periodEnd = sub.currentBillingPeriod?.endsAt ?? null;

  if (userId) {
    await pool.query(
      `UPDATE users
          SET plan = 'pro',
              subscription_status = $1,
              current_period_end = $2,
              paddle_subscription_id = $3,
              paddle_customer_id = COALESCE(paddle_customer_id, $4)
        WHERE id = $5`,
      [status, periodEnd, sub.id, sub.customerId, userId]
    );
  } else if (sub.customerId) {
    await pool.query(
      `UPDATE users
          SET plan = 'pro',
              subscription_status = $1,
              current_period_end = $2,
              paddle_subscription_id = $3
        WHERE paddle_customer_id = $4`,
      [status, periodEnd, sub.id, sub.customerId]
    );
  } else {
    console.warn('[paddle] subscription event with no user_id or customer_id', sub.id);
  }
  return { userId, status, periodEnd };
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
