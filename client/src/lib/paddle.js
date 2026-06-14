import { initializePaddle } from '@paddle/paddle-js';
import { api } from './api';

// Lazily initialize Paddle.js from the server-provided public config (client
// token + environment). Cached after first init. The webhook remains the source
// of truth for entitlement; Paddle.js just runs the checkout overlay.
let paddlePromise = null;
let onCompleteCb = null;

async function getPaddle() {
  if (!paddlePromise) {
    paddlePromise = (async () => {
      const cfg = await api.config();
      const token = cfg?.paddle?.clientToken;
      if (!token) {
        const err = new Error('Billing is not configured');
        err.code = 'billing_unconfigured';
        throw err;
      }
      return initializePaddle({
        environment: cfg.paddle.environment === 'production' ? 'production' : 'sandbox',
        token,
        eventCallback: (ev) => {
          if (ev?.name === 'checkout.completed' && onCompleteCb) onCompleteCb(ev);
        },
      });
    })().catch((err) => {
      paddlePromise = null; // allow retry after a failed init
      throw err;
    });
  }
  return paddlePromise;
}

// Open the checkout overlay for a transaction created server-side. `onComplete`
// fires on Paddle's checkout.completed event; callers should still refresh the
// user from the server afterward, since the webhook is what actually flips Pro.
export async function openCheckout(transactionId, { onComplete } = {}) {
  const paddle = await getPaddle();
  onCompleteCb = onComplete || null;
  paddle.Checkout.open({
    transactionId,
    settings: { theme: 'dark', displayMode: 'overlay' },
  });
}
