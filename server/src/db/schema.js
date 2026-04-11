import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../gtd.db');

let db;

export async function initDb() {
  const SQL = await initSqlJs();
  
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'on_hold')),
      outcome TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      list TEXT DEFAULT 'inbox' CHECK(list IN ('inbox', 'next_actions', 'waiting_for', 'someday_maybe', 'completed')),
      context TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      waiting_for_person TEXT,
      due_date DATE,
      energy_level TEXT CHECK(energy_level IN ('low', 'medium', 'high')),
      time_estimate INTEGER,
      priority INTEGER DEFAULT 0,
      is_daily_focus INTEGER DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_daily ON tasks(is_daily_focus)`);

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`);

  // Migration: add user_id to tasks and projects if not present
  const tasksColumns = db.exec("PRAGMA table_info(tasks)");
  const hasTasksUserId = tasksColumns[0]?.values.some(col => col[1] === 'user_id');
  if (!hasTasksUserId) {
    db.run('ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }

  const projectsColumns = db.exec("PRAGMA table_info(projects)");
  const hasProjectsUserId = projectsColumns[0]?.values.some(col => col[1] === 'user_id');
  if (!hasProjectsUserId) {
    db.run('ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)`);

  // Contexts table
  db.run(`
    CREATE TABLE IF NOT EXISTS contexts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contexts_name_user ON contexts(name, user_id)`);

  saveDb();
  return db;
}

export function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

export function getDb() {
  return db;
}

export default { initDb, getDb, saveDb };
