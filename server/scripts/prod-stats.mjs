// Read-only product numbers from production: sign-ups, activation, return,
// AI usage, paying accounts. Connects as `cleartable_readonly` (see
// create-readonly-role.mjs), which can only read ids/dates/statuses — never
// task text, tokens or payment ids. Emails are masked in the output.
//
//   node --env-file=.env scripts/prod-stats.mjs            # last 30 days
//   node --env-file=.env scripts/prod-stats.mjs --days 7
//
// STATS_EXCLUDE_EMAILS (comma-separated, in server/.env) hides the founder's
// own accounts from the stranger numbers.
import pg from 'pg';

const url = process.env.DATABASE_READONLY_URL;
if (!url) {
  console.error('DATABASE_READONLY_URL is not set (server/.env). Create it with scripts/create-readonly-role.mjs.');
  process.exit(1);
}
const daysArg = process.argv.indexOf('--days');
const DAYS = Math.min(365, Math.max(1, Number(daysArg > -1 ? process.argv[daysArg + 1] : 30) || 30));
const EXCLUDE = (process.env.STATS_EXCLUDE_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const mask = (email) => {
  const [local = '', domain = ''] = String(email || '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows: users } = await client.query(
    `SELECT id, email, created_at, last_login, onboarded_at, plan, subscription_status, current_period_end
       FROM users ORDER BY created_at`
  );
  const isFounder = (u) => EXCLUDE.includes(String(u.email).toLowerCase());
  const strangers = users.filter(u => !isFounder(u));
  const since = new Date(Date.now() - DAYS * 86400000);
  const recent = strangers.filter(u => new Date(u.created_at) >= since);
  const ids = strangers.map(u => u.id);

  // Activity per user: distinct days with a task created/completed or a habit logged.
  const { rows: act } = await client.query(
    `SELECT user_id, d::date AS d FROM (
        SELECT user_id, created_at AS d FROM tasks WHERE user_id = ANY($1)
        UNION ALL SELECT user_id, completed_at FROM tasks WHERE user_id = ANY($1) AND completed_at IS NOT NULL
        UNION ALL SELECT user_id, created_at FROM habit_logs WHERE user_id = ANY($1)
      ) x GROUP BY user_id, d::date`,
    [ids]
  );
  const activeDays = new Map();
  for (const r of act) {
    if (!activeDays.has(r.user_id)) activeDays.set(r.user_id, []);
    activeDays.get(r.user_id).push(new Date(r.d));
  }
  const { rows: taskCounts } = await client.query(
    `SELECT user_id, COUNT(*)::int AS created, COUNT(completed_at)::int AS completed
       FROM tasks WHERE user_id = ANY($1) GROUP BY user_id`,
    [ids]
  );
  const tasksOf = new Map(taskCounts.map(r => [r.user_id, r]));
  const { rows: ai } = await client.query(
    `SELECT user_id, SUM(count)::int AS calls FROM ai_usage
      WHERE user_id = ANY($1) AND usage_date >= CURRENT_DATE - $2::int GROUP BY user_id`,
    [ids, DAYS]
  );
  const aiOf = new Map(ai.map(r => [r.user_id, r.calls]));

  const returnedD7 = (u) => {
    const start = new Date(u.created_at).getTime();
    const days = activeDays.get(u.id) || [];
    const lastLogin = u.last_login ? new Date(u.last_login).getTime() : 0;
    return days.some(d => d.getTime() - start >= 7 * 86400000) || lastLogin - start >= 7 * 86400000;
  };
  const oldEnoughForD7 = (u) => Date.now() - new Date(u.created_at).getTime() >= 7 * 86400000;
  const paying = (u) => u.plan === 'pro' && (['active', 'trialing'].includes(u.subscription_status)
    || (u.current_period_end && new Date(u.current_period_end) > new Date()));

  // --- Sign-ups by day ---
  console.log(`\nCleartable — production, last ${DAYS} days (founder accounts excluded: ${users.length - strangers.length})\n`);
  const byDay = new Map();
  for (const u of recent) byDay.set(day(u.created_at), (byDay.get(day(u.created_at)) || 0) + 1);
  console.log('Sign-ups by day:', byDay.size ? [...byDay].map(([d, n]) => `${d}: ${n}`).join(' · ') : 'none');

  // --- Funnel (people who signed up in the window) ---
  const onboarded = recent.filter(u => u.onboarded_at);
  const threeTasks = recent.filter(u => (tasksOf.get(u.id)?.created || 0) >= 3);
  const d7Eligible = recent.filter(oldEnoughForD7);
  const d7 = d7Eligible.filter(returnedD7);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  console.log(`\nFunnel: signed up ${recent.length} → onboarded ${onboarded.length} (${pct(onboarded.length, recent.length)})`
    + ` → ≥3 tasks ${threeTasks.length} (${pct(threeTasks.length, recent.length)})`
    + ` → back after 7 days ${d7.length}/${d7Eligible.length} old enough (${pct(d7.length, d7Eligible.length)})`);

  // --- Totals ---
  const payingAll = strangers.filter(paying);
  const weekAgo = Date.now() - 7 * 86400000;
  const activeThisWeek = strangers.filter(u => (activeDays.get(u.id) || []).some(d => d.getTime() >= weekAgo)
    || (u.last_login && new Date(u.last_login).getTime() >= weekAgo));
  console.log(`All-time strangers: ${strangers.length} · active in last 7 days: ${activeThisWeek.length} · paying: ${payingAll.length}`);
  const aiTotal = [...aiOf.values()].reduce((s, n) => s + n, 0);
  console.log(`AI actions (last ${DAYS} days): ${aiTotal} by ${aiOf.size} people`);

  // --- Per person (signed up in the window) ---
  if (recent.length) {
    console.log('\nNew people:');
    console.table(recent.map(u => ({
      who: mask(u.email),
      signed_up: day(u.created_at),
      onboarded: u.onboarded_at ? 'yes' : 'no',
      tasks: tasksOf.get(u.id)?.created || 0,
      done: tasksOf.get(u.id)?.completed || 0,
      active_days: (activeDays.get(u.id) || []).length,
      last_seen: day(u.last_login),
      back_d7: oldEnoughForD7(u) ? (returnedD7(u) ? 'yes' : 'no') : 'too new',
      ai: aiOf.get(u.id) || 0,
      plan: paying(u) ? 'pro' : 'free',
    })));
  }
  console.log('');
} finally {
  await client.end();
}
