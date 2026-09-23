import { pool } from '../db/pool.js';
import { getUserPlan } from './billing.js';
import { todayInTz, isValidTimezone } from '../lib/dateTime.js';

// Daily AI-call caps per tier. 0 / unset = UNLIMITED (enforcement off). We keep
// enforcement off by default so this layer can ship to production as a pure
// counter first — we observe real usage, then set a real free-tier cap at launch
// without retroactively throttling anyone. Set AI_DAILY_LIMIT_FREE / _PRO to flip
// enforcement on.
const DAILY_LIMITS = {
  free: Number(process.env.AI_DAILY_LIMIT_FREE) || 0,
  pro: Number(process.env.AI_DAILY_LIMIT_PRO) || 0,
};

// The daily bucket is the USER's calendar day, so the cap resets at their
// local midnight (and "resets at midnight" in the UI is true). The day comes
// from the timezone stored on the account at sign-in, not from the request's
// X-Client-Timezone header: a header is the caller's to choose, and flipping it
// between UTC-12 and UTC+14 opened a second day's bucket. Callers still pass
// `req.today`, used only when the account has no stored zone; UTC date when
// neither exists (scripts, tests).
const TZ_CACHE_MS = 10 * 60_000;
const tzCache = new Map(); // userId → { tz, at }

async function storedTimezone(userId) {
  const hit = tzCache.get(userId);
  if (hit && Date.now() - hit.at < TZ_CACHE_MS) return hit.tz;
  const { rows } = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
  const tz = isValidTimezone(rows[0]?.timezone) ? rows[0].timezone : null;
  tzCache.set(userId, { tz, at: Date.now() });
  return tz;
}

async function bucketDay(userId, day) {
  const tz = await storedTimezone(userId).catch(() => null);
  if (tz) return todayInTz(tz);
  return day || new Date().toISOString().split('T')[0];
}

// Tier resolution reads the user's live plan (billing #5): a Pro subscription
// derived from Paddle's synced state, else 'free'. The caps below then apply
// automatically — nothing else in this module changed.
export async function getTier(userId) {
  return getUserPlan(userId);
}

async function limitFor(userId) {
  const tier = await getTier(userId);
  return DAILY_LIMITS[tier] ?? 0;
}

export async function getUsageToday(userId, day) {
  const { rows } = await pool.query(
    'SELECT count FROM ai_usage WHERE user_id = $1 AND usage_date = $2',
    [userId, await bucketDay(userId, day)]
  );
  return rows[0]?.count ?? 0;
}

async function increment(userId, weight, day) {
  await pool.query(
    `INSERT INTO ai_usage (user_id, usage_date, count)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = ai_usage.count + EXCLUDED.count`,
    [userId, await bucketDay(userId, day), weight]
  );
}

// Pre-flight cap check for the gate: is the user under budget right now? Read
// only — it does NOT increment. The actual charge is recorded AFTER a successful
// AI call (see charge()), so no-op requests (empty inbox) and provider failures
// never burn budget. A boundary race between two concurrent requests can let both
// through and overshoot the cap by a hair; acceptable for a soft, non-punitive
// daily valve (and the counter is observational until AI_DAILY_LIMIT_* is set).
export async function check(userId, day) {
  const limit = await limitFor(userId);
  const unlimited = limit <= 0;
  const used = await getUsageToday(userId, day);
  return {
    allowed: unlimited || used < limit,
    used,
    limit: unlimited ? null : limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}

// Record `weight` successful AI calls against today's budget. Call only after the
// AI work actually succeeded, so failures and no-ops aren't counted.
export async function charge(userId, weight = 1, day) {
  await increment(userId, weight, day);
}

// Read-only snapshot for the client (usage meter / upgrade nudge). Does not consume.
export async function getStatus(userId, day) {
  const limit = await limitFor(userId);
  const used = await getUsageToday(userId, day);
  const unlimited = limit <= 0;
  return {
    tier: await getTier(userId),
    used,
    limit: unlimited ? null : limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}
