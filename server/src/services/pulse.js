import { pool } from '../db/pool.js';
import { aiStatus } from './aiRouter.js';
import { founderSpotsLeft, FOUNDER_CAP } from './paddle.js';

// Everything the founder's monitoring page shows, as one JSON of aggregate
// numbers: health, real visitors, sign-ups, the activation funnel against the
// kill/continue gate, money, AI, errors and inquiries. No task content, no
// full emails (masked), no tokens. Served by GET /api/internal/pulse behind
// PULSE_TOKEN; an hourly job copies it into the monitoring artifact.
//
// External sources are optional and cached 10 min: Cloudflare Web Analytics
// (CF_API_TOKEN + CF_ACCOUNT_ID + CF_WEB_ANALYTICS_SITE_TAG) for real
// visitors, UptimeRobot (UPTIMEROBOT_API_KEY) for uptime. Missing config →
// that block is null and the page says what to set.

const DAY = 86_400_000;
const GATE = { date: '2026-12-01', signIns: 100, d7Rate: 0.2, paying: 5, since: '2026-09-15' };

const mask = (email) => {
  const [local = '', domain = ''] = String(email || '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const excluded = () => (process.env.STATS_EXCLUDE_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const cache = new Map();
async function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  cache.set(key, { value, at: Date.now() });
  return value;
}

// ─── Health ────────────────────────────────────────────────────────────────
async function health() {
  const t0 = Date.now();
  let dbOk = true;
  try { await pool.query('SELECT 1'); } catch { dbOk = false; }
  const ai = aiStatus();
  return {
    ok: dbOk,
    dbMs: Date.now() - t0,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    aiModelsSkipped: Object.entries(ai.open).map(([model, v]) => ({ model, until: v.until, reason: v.reason })),
  };
}

// ─── Uptime (UptimeRobot) ──────────────────────────────────────────────────
async function uptime() {
  const key = process.env.UPTIMEROBOT_API_KEY;
  if (!key) return null;
  return cached('uptime', 10 * 60_000, async () => {
    try {
      const r = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ api_key: key, format: 'json', custom_uptime_ratios: '1-7-30', response_times: '1', response_times_limit: '1', logs: '1', logs_limit: '5' }),
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json();
      if (j.stat !== 'ok') return { error: j.error?.message || 'UptimeRobot error' };
      return {
        monitors: (j.monitors || []).map(m => {
          const [d1, d7, d30] = String(m.custom_uptime_ratio || '').split('-').map(Number);
          return {
            name: m.friendly_name,
            status: { 0: 'paused', 1: 'not checked yet', 2: 'up', 8: 'seems down', 9: 'down' }[m.status] || 'unknown',
            uptime24h: d1, uptime7d: d7, uptime30d: d30,
            responseMs: Math.round(Number(m.average_response_time) || 0) || null,
            lastDown: (m.logs || []).find(l => l.type === 1)?.datetime ? new Date(m.logs.find(l => l.type === 1).datetime * 1000).toISOString() : null,
          };
        }),
      };
    } catch (err) {
      return { error: err.message };
    }
  });
}

// ─── Real visitors (Cloudflare Web Analytics, browser beacon = no bots) ────
async function visitors() {
  const token = process.env.CF_API_TOKEN;
  const account = process.env.CF_ACCOUNT_ID;
  const site = process.env.CF_WEB_ANALYTICS_SITE_TAG;
  if (!token || !account || !site) return null;
  return cached('visitors', 10 * 60_000, async () => {
    const to = isoDay(Date.now());
    const from = isoDay(Date.now() - 29 * DAY);
    const filter = { AND: [{ siteTag: site }, { date_geq: from }, { date_leq: to }] };
    const since7 = { AND: [{ siteTag: site }, { date_geq: isoDay(Date.now() - 6 * DAY) }, { date_leq: to }] };
    const query = `query ($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $since7: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
      viewer { accounts(filter: { accountTag: $account }) {
        daily: rumPageloadEventsAdaptiveGroups(limit: 40, filter: $filter, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
        referrers: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $since7, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
        pages: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $since7, orderBy: [count_DESC]) { count dimensions { requestPath } }
        countries: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $since7, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
      } }
    }`;
    try {
      const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { account, filter, since7 } }),
        signal: AbortSignal.timeout(10_000),
      });
      const j = await r.json();
      if (j.errors?.length) return { error: j.errors[0].message };
      const a = j.data?.viewer?.accounts?.[0] || {};
      const daily = (a.daily || []).map(g => ({ date: g.dimensions.date, visits: g.sum.visits, pageviews: g.count }));
      const sum = (days) => daily.filter(d => d.date >= isoDay(Date.now() - (days - 1) * DAY)).reduce((s, d) => s + d.visits, 0);
      return {
        today: sum(1), last7: sum(7), last30: sum(30),
        daily,
        referrers: (a.referrers || []).map(g => ({ host: g.dimensions.refererHost || '(direct)', visits: g.sum.visits })),
        pages: (a.pages || []).map(g => ({ path: g.dimensions.requestPath, views: g.count })),
        countries: (a.countries || []).map(g => ({ country: g.dimensions.countryName || '?', visits: g.sum.visits })),
      };
    } catch (err) {
      return { error: err.message };
    }
  });
}

// ─── People: sign-ups, activity, funnel, gate, money ───────────────────────
async function people() {
  const { rows: users } = await pool.query(
    `SELECT id, email, created_at, last_login, onboarded_at, plan, subscription_status, current_period_end, paddle_price_id
       FROM users ORDER BY created_at`
  );
  const skip = excluded();
  const strangers = users.filter(u => !skip.includes(String(u.email).toLowerCase()));
  const ids = strangers.map(u => u.id);

  const [{ rows: taskCounts }, { rows: act }] = await Promise.all([
    pool.query(`SELECT user_id, COUNT(*)::int AS created FROM tasks WHERE user_id = ANY($1) GROUP BY user_id`, [ids]),
    pool.query(
      `SELECT user_id, MAX(d) AS last_active, ARRAY_AGG(DISTINCT d::date) AS days FROM (
          SELECT user_id, created_at AS d FROM tasks WHERE user_id = ANY($1)
          UNION ALL SELECT user_id, completed_at FROM tasks WHERE user_id = ANY($1) AND completed_at IS NOT NULL
          UNION ALL SELECT user_id, created_at FROM habit_logs WHERE user_id = ANY($1)
        ) x GROUP BY user_id`,
      [ids]
    ),
  ]);
  const tasksOf = new Map(taskCounts.map(r => [r.user_id, r.created]));
  const actOf = new Map(act.map(r => [r.user_id, r]));
  const now = Date.now();
  const lastSeen = (u) => Math.max(u.last_login ? new Date(u.last_login).getTime() : 0, actOf.get(u.id)?.last_active ? new Date(actOf.get(u.id).last_active).getTime() : 0);
  const cameBack = (u) => {
    const start = new Date(u.created_at).getTime();
    return (actOf.get(u.id)?.days || []).some(d => new Date(d).getTime() - start >= 7 * DAY) || lastSeen(u) - start >= 7 * DAY;
  };
  const paying = (u) => u.plan === 'pro' && (['active', 'trialing'].includes(u.subscription_status)
    || (u.current_period_end && new Date(u.current_period_end).getTime() > now));

  // Sign-ups per day, last 30 days (zero-filled).
  const perDay = new Map();
  for (let i = 29; i >= 0; i--) perDay.set(isoDay(now - i * DAY), 0);
  for (const u of strangers) {
    const d = isoDay(u.created_at);
    if (perDay.has(d)) perDay.set(d, perDay.get(d) + 1);
  }
  const since = (days) => strangers.filter(u => now - new Date(u.created_at).getTime() < days * DAY).length;

  // Funnel + gate count people who arrived since the door opened.
  const cohort = strangers.filter(u => isoDay(u.created_at) >= GATE.since);
  const d7Eligible = cohort.filter(u => now - new Date(u.created_at).getTime() >= 7 * DAY);
  const d7 = d7Eligible.filter(cameBack);
  const payingAll = strangers.filter(paying);

  const priceKind = (id) => ({
    [process.env.PADDLE_PRICE_PRO_MONTHLY]: 'monthly',
    [process.env.PADDLE_PRICE_PRO_YEARLY]: 'yearly',
    [process.env.PADDLE_PRICE_FOUNDER]: 'founder',
  })[id] || 'unknown';
  const byKind = { monthly: 0, yearly: 0, founder: 0, unknown: 0 };
  for (const u of payingAll) byKind[priceKind(u.paddle_price_id)]++;
  // Gross MRR at list prices, VAT-inclusive, before Paddle's fee.
  const mrr = byKind.monthly * 4 + byKind.yearly * 3 + byKind.founder * 2.5;

  return {
    signUps: {
      today: since(1), last7: since(7), last30: since(30), allTime: strangers.length,
      daily: [...perDay].map(([date, n]) => ({ date, n })),
      latest: [...strangers].reverse().slice(0, 6).map(u => ({
        who: mask(u.email),
        at: u.created_at,
        onboarded: !!u.onboarded_at,
        tasks: tasksOf.get(u.id) || 0,
        lastSeen: lastSeen(u) ? new Date(lastSeen(u)).toISOString() : null,
        paying: paying(u),
      })),
    },
    activeLast7: strangers.filter(u => now - lastSeen(u) < 7 * DAY).length,
    funnel: {
      since: GATE.since,
      signedUp: cohort.length,
      onboarded: cohort.filter(u => u.onboarded_at).length,
      threeTasks: cohort.filter(u => (tasksOf.get(u.id) || 0) >= 3).length,
      backAfter7: d7.length,
      backAfter7Eligible: d7Eligible.length,
      paying: cohort.filter(paying).length,
    },
    gate: {
      ...GATE,
      daysLeft: Math.max(0, Math.ceil((new Date(`${GATE.date}T00:00:00Z`).getTime() - now) / DAY)),
      signInsNow: cohort.length,
      d7RateNow: d7Eligible.length ? d7.length / d7Eligible.length : null,
      payingNow: payingAll.length,
    },
    money: {
      paying: payingAll.length,
      byPlan: byKind,
      mrrUsd: Math.round(mrr * 100) / 100,
      founderSeatsLeft: await founderSpotsLeft().catch(() => null),
      founderCap: FOUNDER_CAP,
      canceling: strangers.filter(u => u.plan === 'pro' && u.subscription_status === 'canceled' && paying(u)).length,
    },
  };
}

// ─── AI, errors, inquiries ─────────────────────────────────────────────────
async function ai() {
  const skip = excluded();
  const { rows } = await pool.query(
    `SELECT a.usage_date::text AS date, SUM(a.count)::int AS actions,
            SUM(CASE WHEN LOWER(u.email) = ANY($1) THEN 0 ELSE a.count END)::int AS stranger_actions,
            COUNT(DISTINCT a.user_id)::int AS people
       FROM ai_usage a JOIN users u ON u.id = a.user_id
      WHERE a.usage_date >= CURRENT_DATE - 13
      GROUP BY a.usage_date ORDER BY a.usage_date`,
    [skip]
  );
  const month = await pool.query(
    `SELECT COALESCE(SUM(count), 0)::int AS n FROM ai_usage WHERE usage_date >= date_trunc('month', CURRENT_DATE)`
  );
  const actionsThisMonth = month.rows[0].n;
  return {
    daily: rows,
    actionsThisMonth,
    // Rough: ~$0.002 per action across the current model mix (captures are
    // ~$0.0006, planners ~$0.003). Replace with real token logging if it matters.
    estSpendThisMonthUsd: Math.round(actionsThisMonth * 0.002 * 100) / 100,
    spendReviewAtUsd: 10,
  };
}

async function opsEvents() {
  await pool.query(`DELETE FROM ops_events WHERE created_at < NOW() - INTERVAL '90 days'`).catch(() => {});
  const { rows } = await pool.query(
    `SELECT kind,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last24h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last7
       FROM ops_events GROUP BY kind`
  );
  const count = (k) => rows.find(r => r.kind === k) || { last24h: 0, last7: 0 };
  const { rows: top } = await pool.query(
    `SELECT kind, label, COUNT(*)::int AS n, MAX(created_at) AS last
       FROM ops_events WHERE kind IN ('server_error', 'client_error') AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY kind, label ORDER BY n DESC LIMIT 5`
  );
  const { rows: inquiries } = await pool.query(
    `SELECT label, created_at AS at FROM ops_events WHERE kind = 'inquiry' ORDER BY created_at DESC LIMIT 6`
  );
  return {
    errors: {
      server: { last24h: count('server_error').last24h, last7: count('server_error').last7 },
      client: { last24h: count('client_error').last24h, last7: count('client_error').last7 },
      top,
    },
    inquiries: { last24h: count('inquiry').last24h, last7: count('inquiry').last7, latest: inquiries },
  };
}

export async function buildPulse() {
  const [h, up, v, p, a, o] = await Promise.all([
    health(),
    uptime(),
    visitors(),
    people(),
    ai().catch(err => ({ error: err.message })),
    opsEvents().catch(err => ({ error: err.message })),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    health: h,
    uptime: up,
    visitors: v,
    ...p,
    ai: a,
    ...o,
    configured: {
      visitors: v !== null,
      uptime: up !== null,
    },
  };
}
