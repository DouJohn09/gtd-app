// One-shot data migration: legacy sql.js gtd.db → Postgres.
//
// Reads the existing SQLite DB (read-only, no modifications) and inserts
// every row into Postgres, preserving primary keys. After inserts, each
// table's sequence is advanced past the max id so future INSERTs don't clash.
//
// Idempotent on PRIMARY KEY (ON CONFLICT (id) DO NOTHING) — but the schema
// also has unique constraints on users.google_id, users.email, and
// contexts(name,user_id). If those conflict, the migration aborts. Pass
// --reset to truncate every table before migrating. Use --reset only when
// the target PG has no irreplaceable data (i.e. local dev or a fresh prod).
//
// Usage:
//   DATABASE_URL=... node scripts/migrate-sqlite-to-pg.js [--reset] [path-to-gtd.db]
//   (path defaults to ./gtd.db relative to the server/ dir)
//
// Order is FK-safe: parents before children.

import '../src/env.js';
import { pool } from '../src/db/pool.js';
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const resetFlag = args.includes('--reset');
const pathArg = args.find(a => !a.startsWith('--'));
const sqlitePath = resolve(pathArg || join(__dirname, '..', 'gtd.db'));

if (!existsSync(sqlitePath)) {
  console.error(`SQLite DB not found at: ${sqlitePath}`);
  process.exit(1);
}

// Columns to copy per table. The order here determines INSERT column order.
// PG-only columns (none) and SQLite-only columns are intentionally not listed.
const TABLES = [
  {
    name: 'users',
    cols: [
      'id', 'google_id', 'email', 'name', 'picture',
      'google_calendar_access_token', 'google_calendar_refresh_token',
      'google_calendar_token_expiry', 'gtd_calendar_id', 'google_calendar_scopes',
      'created_at', 'last_login',
    ],
  },
  {
    name: 'projects',
    cols: [
      'id', 'name', 'description', 'status', 'outcome', 'execution_mode',
      'user_id', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'contexts',
    cols: ['id', 'name', 'user_id', 'created_at'],
  },
  {
    name: 'habits',
    cols: [
      'id', 'name', 'description', 'frequency', 'target_days', 'category',
      'color', 'user_id', 'active', 'created_at',
    ],
    booleans: ['active'],
  },
  {
    name: 'custom_lists',
    cols: ['id', 'name', 'icon', 'color', 'user_id', 'position', 'created_at'],
  },
  {
    name: 'tasks',
    cols: [
      'id', 'title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person',
      'due_date', 'start_date', 'scheduled_time', 'duration', 'energy_level',
      'time_estimate', 'priority', 'is_daily_focus', 'position',
      'recurrence_rule', 'recurrence_interval', 'recurrence_days', 'recurrence_type',
      'google_event_id', 'completed_at', 'user_id', 'created_at', 'updated_at',
    ],
    booleans: ['is_daily_focus'],
  },
  {
    name: 'habit_logs',
    cols: ['id', 'habit_id', 'completed_date', 'user_id', 'created_at'],
  },
  {
    name: 'list_items',
    cols: [
      'id', 'list_id', 'title', 'notes', 'url', 'status', 'rating', 'position',
      'linked_task_id', 'user_id', 'created_at', 'completed_at',
    ],
  },
  {
    name: 'weekly_reviews',
    cols: [
      'id', 'user_id', 'completed_at', 'inbox_count_at_start',
      'tasks_completed', 'tasks_moved', 'tasks_deleted', 'ai_summary', 'created_at',
    ],
  },
];

async function readSqliteTable(db, table, cols) {
  const colList = cols.join(', ');
  const stmt = db.prepare(`SELECT ${colList} FROM ${table}`);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function coerceRow(row, booleans = []) {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) out[k] = null;
    if (booleans.includes(k) && out[k] !== null) {
      out[k] = !!out[k];
    }
  }
  return out;
}

async function migrate() {
  console.log(`Reading SQLite from: ${sqlitePath}`);
  const SQL = await initSqlJs();
  const sqliteDb = new SQL.Database(readFileSync(sqlitePath));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (resetFlag) {
      // Truncate every target table. RESTART IDENTITY resets the sequences so
      // post-migration sequence values match SQLite's id-allocation history.
      // CASCADE handles the FK chain.
      const tableList = TABLES.map(t => t.name).join(', ');
      console.log(`--reset: truncating ${tableList}`);
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }

    for (const table of TABLES) {
      const rows = await readSqliteTable(sqliteDb, table.name, table.cols);
      if (rows.length === 0) {
        console.log(`${table.name}: 0 rows (skipped)`);
        continue;
      }

      const placeholders = table.cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table.name} (${table.cols.join(', ')})
                   VALUES (${placeholders})
                   ON CONFLICT (id) DO NOTHING`;

      let inserted = 0;
      for (const raw of rows) {
        const row = coerceRow(raw, table.booleans);
        const values = table.cols.map(c => row[c]);
        const r = await client.query(sql, values);
        inserted += r.rowCount;
      }
      console.log(`${table.name}: ${inserted}/${rows.length} inserted (rest already existed)`);
    }

    // Advance every sequence past MAX(id) so new INSERTs don't collide with
    // the migrated rows. Safe to run even when no rows were inserted.
    for (const table of TABLES) {
      const seq = `${table.name}_id_seq`;
      await client.query(
        `SELECT setval('${seq}', GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table.name}), 1))`
      );
    }

    await client.query('COMMIT');
    console.log('\n✓ Data migration complete. Sequences advanced.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Migration failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
