// Creates (or re-keys) the `cleartable_readonly` Postgres role used by
// scripts/prod-stats.mjs, and writes its connection string to server/.env as
// DATABASE_READONLY_URL. The password is generated here and never printed.
//
// Run with ADMIN credentials, e.g. from server/:
//   railway run --service Postgres node scripts/create-readonly-role.mjs
// (uses DATABASE_PUBLIC_URL from the Postgres service).
//
// Privacy by construction: the role gets SELECT on named COLUMNS only — ids,
// dates, statuses, counts. No task titles or notes, no habit names, no list
// contents, no Google tokens, no Paddle ids, no waitlist emails. Account emails
// are readable (prod-stats masks them). New tables are NOT granted
// automatically; add them to GRANTS below and re-run.
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE = 'cleartable_readonly';

const GRANTS = {
  users: ['id', 'email', 'created_at', 'last_login', 'plan', 'subscription_status', 'current_period_end', 'timezone', 'ai_mode', 'onboarded_at', 'paddle_price_id'],
  tasks: ['id', 'user_id', 'list', 'project_id', 'due_date', 'scheduled_time', 'is_daily_focus', 'recurrence_rule', 'time_estimate', 'completed_at', 'created_at', 'updated_at'],
  projects: ['id', 'user_id', 'status', 'created_at'],
  contexts: ['id', 'user_id', 'created_at'],
  habits: ['id', 'user_id', 'type', 'frequency', 'active', 'created_at'],
  habit_logs: ['id', 'habit_id', 'user_id', 'completed_date', 'status', 'created_at'],
  custom_lists: ['id', 'user_id', 'created_at'],
  list_items: ['id', 'list_id', 'user_id', 'status', 'created_at', 'completed_at'],
  ai_usage: ['user_id', 'usage_date', 'count'],
  daily_plans: ['id', 'user_id', 'plan_date', 'applied_at', 'created_at'],
  weekly_plans: ['id', 'user_id', 'week_start', 'applied_at', 'created_at'],
  weekly_reviews: ['id', 'user_id', 'completed_at', 'tasks_completed', 'created_at'],
  plan_blocks: ['id', 'user_id', 'task_id', 'plan_date', 'start_time', 'duration', 'estimate_at_plan', 'outcome', 'outcome_at', 'created_at'],
  waitlist: ['id', 'source', 'created_at'],
};

const adminUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!adminUrl) {
  console.error('No DATABASE_PUBLIC_URL / DATABASE_URL in the environment. Run via `railway run --service Postgres`.');
  process.exit(1);
}

const password = crypto.randomBytes(24).toString('base64url');
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  const db = (await client.query('SELECT current_database() AS db')).rows[0].db;
  const quotedDb = `"${db.replace(/"/g, '""')}"`;
  await client.query('BEGIN');
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE])).rowCount > 0;
  // Identifiers/literals below are constants or generated here (base64url), not user input.
  if (exists) {
    await client.query(`ALTER ROLE ${ROLE} WITH LOGIN PASSWORD '${password}'`);
  } else {
    await client.query(`CREATE ROLE ${ROLE} WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 3`);
  }
  await client.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
  await client.query(`ALTER ROLE ${ROLE} SET statement_timeout = '15s'`);
  await client.query(`GRANT CONNECT ON DATABASE ${quotedDb} TO ${ROLE}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  // Start from nothing on every run, then grant exactly the listed columns.
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
  const existing = new Set((await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  )).rows.map(r => `${r.table_name}.${r.column_name}`));
  let granted = 0;
  for (const [table, cols] of Object.entries(GRANTS)) {
    const present = cols.filter(c => existing.has(`${table}.${c}`));
    if (!present.length) continue;
    await client.query(`GRANT SELECT (${present.join(', ')}) ON ${table} TO ${ROLE}`);
    granted += present.length;
  }
  await client.query('COMMIT');

  const u = new URL(adminUrl);
  u.username = ROLE;
  u.password = password;
  const readonlyUrl = u.toString();

  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  env = env.split('\n').filter(l => !l.startsWith('DATABASE_READONLY_URL=')).join('\n').replace(/\n*$/, '\n');
  env += `DATABASE_READONLY_URL=${readonlyUrl}\n`;
  fs.writeFileSync(envPath, env);

  console.log(`${exists ? 'Re-keyed' : 'Created'} role ${ROLE} on ${db}: read-only, ${granted} columns across ${Object.keys(GRANTS).length} tables.`);
  console.log('DATABASE_READONLY_URL written to server/.env (password not shown).');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
