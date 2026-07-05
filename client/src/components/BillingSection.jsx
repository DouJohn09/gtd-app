import { useState, useEffect } from 'react';
import { Sparkles, Check, ExternalLink, Crown } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import { openCheckout } from '../lib/paddle';
import MonoLabel from './ui/MonoLabel';

// Plans offered in-app. Keys match the server's price mapping in routes/billing.js.
const PLANS = [
  { key: 'yearly', label: 'Pro · Annual', price: '$36', cadence: '/year', sub: '~3 months free vs monthly', badge: 'Save 25%', highlight: true },
  { key: 'monthly', label: 'Pro · Monthly', price: '$4', cadence: '/month', sub: 'Flexible · cancel anytime' },
  { key: 'founder', label: 'Founder', price: '$30', cadence: '/year', sub: 'First 30 buyers · refundable 30 days' },
];

const PRO_PERKS = [
  'Unlimited projects, custom lists & habits',
  'Productivity analytics dashboard',
  'Much higher daily AI limit',
];

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

export default function BillingSection() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);

  const isPro = (status?.plan ?? user?.plan) === 'pro';
  const canceling = status?.subscriptionStatus === 'canceled';
  const periodEnd = formatDate(status?.currentPeriodEnd);

  useEffect(() => {
    api.billing.status().then(setStatus).catch(() => {});
  }, []);

  async function refreshStatus() {
    await refreshUser();
    const s = await api.billing.status().catch(() => null);
    if (s) setStatus(s);
  }

  async function upgrade(planKey) {
    setBusy(planKey);
    try {
      const { transactionId } = await api.billing.checkout(planKey);
      await openCheckout(transactionId, {
        onComplete: () => {
          addToast('Payment received — unlocking Pro…', 'success');
          // The webhook flips the plan; give it a moment, then re-read.
          setTimeout(refreshStatus, 1800);
        },
      });
    } catch (err) {
      addToast(
        err.code === 'billing_unconfigured'
          ? "Billing isn't set up yet — check back soon."
          : err.message || 'Could not start checkout',
        'error'
      );
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy('portal');
    try {
      const { url } = await api.billing.portal();
      if (url) window.open(url, '_blank', 'noopener');
      else addToast('Could not open the billing portal', 'error');
    } catch (err) {
      addToast(err.message || 'Could not open the billing portal', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="glass rounded-2xl p-6 mt-6">
      <MonoLabel className="mb-2">plan</MonoLabel>
      <h2 className="font-display text-xl mb-1 flex items-center gap-2">
        {isPro && <Crown className="w-4 h-4" style={{ color: 'rgb(var(--amber))' }} />}
        Billing
      </h2>

      {isPro ? (
        <>
          <p className="text-text-3 text-sm mb-5 leading-relaxed">
            You're on <span className="text-text-1 font-medium">Cleartable Pro</span>.
            {canceling && periodEnd
              ? ` Your subscription is set to cancel — you keep Pro until ${periodEnd}.`
              : periodEnd
              ? ` Renews ${periodEnd}.`
              : ''}{' '}
            Thanks for backing the build.
          </p>
          <button
            onClick={manage}
            disabled={busy !== null}
            className="gtd-btn inline-flex items-center gap-2 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
          </button>
        </>
      ) : (
        <>
          <p className="text-text-3 text-sm mb-4 leading-relaxed">
            You're on the <span className="text-text-1 font-medium">Free</span> plan — the full workflow,
            calendar, and AI capture with a daily limit, up to 8 projects · 1 list · 3 habits.
            Upgrade for:
          </p>
          <ul className="text-[13px] text-text-2 space-y-1.5 mb-5">
            {PRO_PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5" style={{ color: 'rgb(var(--mint))' }} />
                {p}
              </li>
            ))}
          </ul>

          <div className="grid sm:grid-cols-3 gap-3">
            {PLANS.map((plan) => (
              <button
                key={plan.key}
                onClick={() => upgrade(plan.key)}
                disabled={busy !== null}
                className="text-left rounded-xl p-4 transition-all disabled:opacity-50"
                style={
                  plan.highlight
                    ? { background: 'rgb(var(--violet) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.35)' }
                    : { boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.08)' }
                }
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {plan.key === 'founder' && <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgb(var(--violet-glow))' }} />}
                  <span className="text-[12px] font-medium text-text-1">{plan.label}</span>
                  {plan.badge && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgb(var(--mint) / 0.15)', color: 'rgb(var(--mint))' }}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>
                <div className="font-display text-2xl text-text-1">
                  {plan.price}
                  <span className="text-sm text-text-3">{plan.cadence}</span>
                </div>
                <div className="text-[11px] text-text-3 mt-1 leading-snug">
                  {busy === plan.key ? 'Opening checkout…' : plan.sub}
                </div>
              </button>
            ))}
          </div>
          <p className="text-text-3 text-[11px] mt-3">
            Secure checkout by Paddle, our payment provider. Cancel anytime · refundable per our{' '}
            <a href="/refund.html" target="_blank" rel="noopener" style={{ color: 'rgb(var(--violet))' }}>
              refund policy
            </a>.
          </p>
        </>
      )}
    </section>
  );
}
