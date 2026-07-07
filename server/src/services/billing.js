import { pool } from '../db/pool.js';

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------
// Paddle is the source of truth; the users table caches the latest subscription
// state synced by the webhook. "Pro right now" is derived, not stored, so a
// single rule governs dunning and end-of-period cancellation:
//   - active / trialing            → Pro
//   - past_due / canceled / paused → Pro *until* current_period_end passes
//     (the user already paid for the current period; don't yank access mid-cycle)
//   - anything else / no sub       → Free
export function isProActive(user) {
  if (!user || user.plan !== 'pro') return false;
  const status = user.subscription_status;
  if (status === 'active' || status === 'trialing') return true;
  if (['past_due', 'canceled', 'paused'].includes(status) && user.current_period_end) {
    return new Date(user.current_period_end) > new Date();
  }
  return false;
}

export async function getUserPlan(userId) {
  const { rows } = await pool.query(
    'SELECT plan, subscription_status, current_period_end FROM users WHERE id = $1',
    [userId]
  );
  return isProActive(rows[0]) ? 'pro' : 'free';
}

// ---------------------------------------------------------------------------
// Capacity gates (Free tier)
// ---------------------------------------------------------------------------
// Free taste-then-ceiling limits. Pro is unlimited. Gating principle: capacity-
// gate "coming-back" features so free users hit the wall as commitment grows.
export const FREE_LIMITS = { projects: 8, custom_lists: 1, habits: 3 };

const COUNT_SQL = {
  projects: 'SELECT COUNT(*)::int AS cnt FROM projects WHERE user_id = $1',
  custom_lists: 'SELECT COUNT(*)::int AS cnt FROM custom_lists WHERE user_id = $1',
  habits: 'SELECT COUNT(*)::int AS cnt FROM habits WHERE user_id = $1 AND active = true',
};

export class LimitError extends Error {
  constructor(resource, limit) {
    super(`You've reached the Free plan limit of ${limit} ${resource.replace('_', ' ')}. Upgrade to Pro for unlimited.`);
    this.name = 'LimitError';
    this.code = 'limit_reached';
    this.resource = resource;
    this.limit = limit;
  }
}

// Throw LimitError (→ 402 in routes) if a Free user is at their cap for the
// resource. No-op for Pro and for resources without a cap.
export async function assertWithinLimit(userId, resource) {
  const limit = FREE_LIMITS[resource];
  if (!limit) return;
  if ((await getUserPlan(userId)) === 'pro') return;
  const { rows } = await pool.query(COUNT_SQL[resource], [userId]);
  if (rows[0].cnt >= limit) throw new LimitError(resource, limit);
}

// How many more of `resource` a user may create right now — Infinity for Pro and
// for uncapped resources. For bulk paths (import) that should create up to the
// cap and skip the rest rather than throwing a 402 mid-batch.
export async function remainingAllowance(userId, resource) {
  const limit = FREE_LIMITS[resource];
  if (!limit) return Infinity;
  if ((await getUserPlan(userId)) === 'pro') return Infinity;
  const { rows } = await pool.query(COUNT_SQL[resource], [userId]);
  return Math.max(0, limit - rows[0].cnt);
}

// Daily-planning gate: Free gets PLAN_DAYS_FREE_PER_MONTH distinct planned
// days per calendar month (a taste of the ritual), Pro plans every day.
// Only APPLIED days count — merely generating a proposal and cancelling it must
// not burn the monthly allowance. Re-planning the same day is free (one row per
// day), and the current day is excluded so today's replans never self-block.
export const PLAN_DAYS_FREE_PER_MONTH = 3;

export async function assertPlanWithinLimit(userId, planDate) {
  if ((await getUserPlan(userId)) === 'pro') return;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM daily_plans
     WHERE user_id = $1
       AND applied_at IS NOT NULL
       AND plan_date >= date_trunc('month', $2::date)
       AND plan_date < date_trunc('month', $2::date) + interval '1 month'
       AND plan_date != $2::date`,
    [userId, planDate]
  );
  if (rows[0].cnt >= PLAN_DAYS_FREE_PER_MONTH) {
    throw new LimitError('planned days this month', PLAN_DAYS_FREE_PER_MONTH);
  }
}
