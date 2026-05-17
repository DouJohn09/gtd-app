// One-shot user-data recovery: pull one local user's data out of a sqlite
// file and insert it into Postgres under a different user_id. Used to recover
// the user's prod data from a legacy /data/gtd.db after the sql.js -> PG
// cutover wiped it from the active codepath (the file survived on the volume).
//
// Unlike migrate-sqlite-to-pg.js, this script does NOT preserve primary keys —
// it lets PG auto-assign new ones and remaps FK relationships within the
// migrated batch (project_id, habit_id, list_id, linked_task_id).
//
// Usage:
//   DATABASE_URL=<railway-public-url> \
//   node scripts/recover-user-data.js \
//     --sqlite /tmp/recovered-gtd.db \
//     --from-user-id 2 \
//     --to-user-id 1

import '../src/env.js';
import { pool } from '../src/db/pool.js';
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const sqlitePath = arg('sqlite');
const fromUserId = parseInt(arg('from-user-id'), 10);
const toUserId = parseInt(arg('to-user-id'), 10);

if (!sqlitePath || !fromUserId || !toUserId) {
  console.error('Usage: node recover-user-data.js --sqlite <path> --from-user-id <n> --to-user-id <n>');
  process.exit(1);
}
if (!existsSync(sqlitePath)) {
  console.error(`SQLite not found: ${sqlitePath}`);
  process.exit(1);
}

function asBool(v) { return v === null || v === undefined ? null : !!v; }
function asIntOrNull(v) { return v === null || v === undefined || v === '' ? null : Number(v); }
function asStrOrNull(v) { return v === null || v === undefined || v === '' ? null : String(v); }

async function readAll(sqliteDb, sql, params = []) {
  const stmt = sqliteDb.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function recover() {
  console.log(`Reading SQLite: ${sqlitePath}`);
  console.log(`Mapping user_id ${fromUserId} -> ${toUserId}`);
  const SQL = await initSqlJs();
  const sqliteDb = new SQL.Database(readFileSync(sqlitePath));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Projects ---
    const projects = await readAll(sqliteDb, 'SELECT * FROM projects WHERE user_id = ?', [fromUserId]);
    const projectIdMap = new Map();
    for (const p of projects) {
      const { rows } = await client.query(
        `INSERT INTO projects (name, description, status, outcome, execution_mode, user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [p.name, p.description, p.status || 'active', p.outcome, p.execution_mode || 'parallel', toUserId, p.created_at, p.updated_at]
      );
      projectIdMap.set(p.id, rows[0].id);
    }
    console.log(`projects: ${projects.length}`);

    // --- Contexts (skip if name already exists for the target user) ---
    const contexts = await readAll(sqliteDb, 'SELECT * FROM contexts WHERE user_id = ?', [fromUserId]);
    let insertedCtx = 0;
    for (const c of contexts) {
      const { rows } = await client.query(
        `INSERT INTO contexts (name, user_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT (name, user_id) DO NOTHING RETURNING id`,
        [c.name, toUserId, c.created_at]
      );
      if (rows.length) insertedCtx++;
    }
    console.log(`contexts: ${insertedCtx}/${contexts.length} inserted (rest already existed by name)`);

    // --- Habits ---
    const habits = await readAll(sqliteDb, 'SELECT * FROM habits WHERE user_id = ?', [fromUserId]);
    const habitIdMap = new Map();
    for (const h of habits) {
      const { rows } = await client.query(
        `INSERT INTO habits (name, description, frequency, target_days, category, color, user_id, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [h.name, h.description, h.frequency || 'daily', h.target_days, h.category, h.color || '#3b82f6', toUserId, asBool(h.active ?? 1), h.created_at]
      );
      habitIdMap.set(h.id, rows[0].id);
    }
    console.log(`habits: ${habits.length}`);

    // --- Custom lists ---
    const customLists = await readAll(sqliteDb, 'SELECT * FROM custom_lists WHERE user_id = ?', [fromUserId]);
    const listIdMap = new Map();
    for (const l of customLists) {
      const { rows } = await client.query(
        `INSERT INTO custom_lists (name, icon, color, user_id, position, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [l.name, l.icon || 'list', l.color || 'violet', toUserId, l.position || 0, l.created_at]
      );
      listIdMap.set(l.id, rows[0].id);
    }
    console.log(`custom_lists: ${customLists.length}`);

    // --- Tasks (project_id remapped) ---
    const tasks = await readAll(sqliteDb, 'SELECT * FROM tasks WHERE user_id = ?', [fromUserId]);
    const taskIdMap = new Map();
    for (const t of tasks) {
      const newProjectId = t.project_id ? projectIdMap.get(t.project_id) ?? null : null;
      const { rows } = await client.query(
        `INSERT INTO tasks (
          title, notes, list, context, project_id, waiting_for_person,
          due_date, start_date, scheduled_time, duration, energy_level, time_estimate,
          priority, is_daily_focus, position, recurrence_rule, recurrence_interval,
          recurrence_days, recurrence_type, completed_at, user_id, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        ) RETURNING id`,
        [
          t.title, t.notes, t.list || 'inbox', t.context, newProjectId, t.waiting_for_person,
          asStrOrNull(t.due_date), asStrOrNull(t.start_date), t.scheduled_time, asIntOrNull(t.duration),
          t.energy_level, asIntOrNull(t.time_estimate),
          asIntOrNull(t.priority) ?? 0, asBool(t.is_daily_focus), asIntOrNull(t.position) ?? 0,
          t.recurrence_rule, asIntOrNull(t.recurrence_interval) ?? 1, t.recurrence_days, t.recurrence_type || 'absolute',
          t.completed_at, toUserId, t.created_at, t.updated_at,
        ]
      );
      taskIdMap.set(t.id, rows[0].id);
    }
    console.log(`tasks: ${tasks.length}`);

    // --- Habit logs (habit_id remapped) ---
    const habitLogs = await readAll(sqliteDb, 'SELECT * FROM habit_logs WHERE user_id = ?', [fromUserId]);
    let insertedLogs = 0;
    for (const log of habitLogs) {
      const newHabitId = habitIdMap.get(log.habit_id);
      if (!newHabitId) continue;
      const { rows } = await client.query(
        `INSERT INTO habit_logs (habit_id, completed_date, user_id, created_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (habit_id, completed_date) DO NOTHING RETURNING id`,
        [newHabitId, log.completed_date, toUserId, log.created_at]
      );
      if (rows.length) insertedLogs++;
    }
    console.log(`habit_logs: ${insertedLogs}/${habitLogs.length} inserted`);

    // --- List items (list_id + linked_task_id remapped) ---
    const listItems = await readAll(sqliteDb, 'SELECT * FROM list_items WHERE user_id = ?', [fromUserId]);
    for (const it of listItems) {
      const newListId = listIdMap.get(it.list_id);
      if (!newListId) continue;
      const newLinkedTaskId = it.linked_task_id ? taskIdMap.get(it.linked_task_id) ?? null : null;
      await client.query(
        `INSERT INTO list_items (
          list_id, title, notes, url, status, rating, position, linked_task_id,
          user_id, created_at, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          newListId, it.title, it.notes, it.url, it.status || 'todo', asIntOrNull(it.rating),
          asIntOrNull(it.position) ?? 0, newLinkedTaskId, toUserId, it.created_at, it.completed_at,
        ]
      );
    }
    console.log(`list_items: ${listItems.length}`);

    // --- Weekly reviews ---
    const reviews = await readAll(sqliteDb, 'SELECT * FROM weekly_reviews WHERE user_id = ?', [fromUserId]);
    for (const r of reviews) {
      await client.query(
        `INSERT INTO weekly_reviews (
          user_id, completed_at, inbox_count_at_start, tasks_completed,
          tasks_moved, tasks_deleted, ai_summary, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          toUserId, r.completed_at, asIntOrNull(r.inbox_count_at_start) ?? 0,
          asIntOrNull(r.tasks_completed) ?? 0, asIntOrNull(r.tasks_moved) ?? 0,
          asIntOrNull(r.tasks_deleted) ?? 0, r.ai_summary, r.created_at,
        ]
      );
    }
    console.log(`weekly_reviews: ${reviews.length}`);

    await client.query('COMMIT');
    console.log('\n✓ Recovery complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

recover();
