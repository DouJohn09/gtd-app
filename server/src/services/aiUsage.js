import { pool } from '../db/pool.js';
import { getUserPlan } from './billing.js';

// Daily AI-call caps per tier. 0 / unset = UNLIMITED (enforcement off). We keep
// enforcement off by default so this layer can ship to production as a pure
// counter first — we observe real usage, then set a real free-tier cap at launch
// without retroactively throttling anyone. Set AI_DAILY_LIMIT_FREE / _PRO to flip
// enforcement on.
const DAILY_LIMITS = {
  free: Number(process.env.AI_DAILY_LIMIT_FREE) || 0,
  pro: Number(process.env.AI_DAILY_LIMIT_PRO) || 0,
};

// UTC calendar day. Reset happens at UTC midnight — acceptable for a soft,
// non-punitive valve. Revisit (per-user timezone) only if users complain about
// the reset landing mid-evening.
function today() {
  return new Date().toISOString().split('T')[0];
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

export async function getUsageToday(userId) {
  const { rows } = await pool.query(
    'SELECT count FROM ai_usage WHERE user_id = $1 AND usage_date = $2',
    [userId, today()]
  );
  return rows[0]?.count ?? 0;
}

async function increment(userId, weight) {
  await pool.query(
    `INSERT INTO ai_usage (user_id, usage_date, count)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = ai_usage.count + EXCLUDED.count`,
    [userId, today(), weight]
  );
}

// Charge `weight` AI calls against today's budget. Increments only when allowed,
// so a throttled request never inflates the counter. Check-and-increment happens
// in a single statement: the upsert's WHERE clause only lets the increment
// through while under the cap, so concurrent requests at the boundary can't
// both slip past. No row returned = over budget.
export async function consume(userId, weight = 1) {
  const limit = await limitFor(userId);
  const unlimited = limit <= 0;
  const { rows } = await pool.query(
    `INSERT INTO ai_usage (user_id, usage_date, count)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = ai_usage.count + EXCLUDED.count
     WHERE $4::boolean OR ai_usage.count < $5::int
     RETURNING count`,
    [userId, today(), weight, unlimited, limit]
  );
  const allowed = rows.length > 0;
  const used = allowed ? rows[0].count : await getUsageToday(userId);
  return {
    allowed,
    used,
    limit: unlimited ? null : limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}

// Read-only snapshot for the client (usage meter / upgrade nudge). Does not consume.
export async function getStatus(userId) {
  const limit = await limitFor(userId);
  const used = await getUsageToday(userId);
  const unlimited = limit <= 0;
  return {
    tier: await getTier(userId),
    used,
    limit: unlimited ? null : limit,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limit - used),
  };
}
