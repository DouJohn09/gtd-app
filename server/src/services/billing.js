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

// Daily-planning gate: Free gets PLAN_DAYS_FREE_PER_MONTH distinct planned
// days per calendar month (a taste of the ritual), Pro plans every day.
// Re-planning the SAME day is free — the daily_plans upsert means one row per
// day, so the count only grows when a new day is planned.
export const PLAN_DAYS_FREE_PER_MONTH = 3;

export async function assertPlanWithinLimit(userId, planDate) {
  if ((await getUserPlan(userId)) === 'pro') return;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM daily_plans
     WHERE user_id = $1
       AND plan_date >= date_trunc('month', $2::date)
       AND plan_date < date_trunc('month', $2::date) + interval '1 month'
       AND plan_date != $2::date`,
    [userId, planDate]
  );
  if (rows[0].cnt >= PLAN_DAYS_FREE_PER_MONTH) {
    throw new LimitError('planned days this month', PLAN_DAYS_FREE_PER_MONTH);
  }
}
