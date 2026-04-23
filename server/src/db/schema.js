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

  // Migration: add Google Calendar token columns to users
  const usersColumns = db.exec("PRAGMA table_info(users)");
  const hasCalendarToken = usersColumns[0]?.values.some(col => col[1] === 'google_calendar_refresh_token');
  if (!hasCalendarToken) {
    db.run('ALTER TABLE users ADD COLUMN google_calendar_access_token TEXT');
    db.run('ALTER TABLE users ADD COLUMN google_calendar_refresh_token TEXT');
    db.run('ALTER TABLE users ADD COLUMN google_calendar_token_expiry TEXT');
  }

  // Migration: add execution_mode to projects
  const hasExecutionMode = projectsColumns[0]?.values.some(col => col[1] === 'execution_mode');
  if (!hasExecutionMode) {
    db.run("ALTER TABLE projects ADD COLUMN execution_mode TEXT DEFAULT 'parallel'");
  }

  // Migration: add position to tasks (for ordering within sequential projects)
  const hasPosition = tasksColumns[0]?.values.some(col => col[1] === 'position');
  if (!hasPosition) {
    db.run('ALTER TABLE tasks ADD COLUMN position INTEGER DEFAULT 0');
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(project_id, position)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_user_due_date ON tasks(user_id, due_date)');

  // Migration: add start_date (defer dates) to tasks
  const tasksColumnsRefresh = db.exec("PRAGMA table_info(tasks)");
  const hasStartDate = tasksColumnsRefresh[0]?.values.some(col => col[1] === 'start_date');
  if (!hasStartDate) {
    db.run('ALTER TABLE tasks ADD COLUMN start_date DATE');
  }

  // Migration: add recurrence columns to tasks
  const hasRecurrenceRule = tasksColumnsRefresh[0]?.values.some(col => col[1] === 'recurrence_rule');
  if (!hasRecurrenceRule) {
    db.run("ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT");
    db.run("ALTER TABLE tasks ADD COLUMN recurrence_interval INTEGER DEFAULT 1");
    db.run("ALTER TABLE tasks ADD COLUMN recurrence_days TEXT");
    db.run("ALTER TABLE tasks ADD COLUMN recurrence_type TEXT DEFAULT 'absolute'");
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(user_id, start_date)');

  // Migration: add time blocking columns to tasks
  const hasScheduledTime = tasksColumnsRefresh[0]?.values.some(col => col[1] === 'scheduled_time');
  if (!hasScheduledTime) {
    db.run('ALTER TABLE tasks ADD COLUMN scheduled_time TEXT');
    db.run('ALTER TABLE tasks ADD COLUMN duration INTEGER');
  }

  // Migration: add google_event_id to tasks (for one-way push to Google Calendar)
  const tasksColumnsAfterTimeBlocking = db.exec("PRAGMA table_info(tasks)");
  const hasGoogleEventId = tasksColumnsAfterTimeBlocking[0]?.values.some(col => col[1] === 'google_event_id');
  if (!hasGoogleEventId) {
    db.run('ALTER TABLE tasks ADD COLUMN google_event_id TEXT');
  }

  // Migration: add gtd_calendar_id and granted scopes to users
  const usersColumnsRefresh = db.exec("PRAGMA table_info(users)");
  const hasGtdCalendarId = usersColumnsRefresh[0]?.values.some(col => col[1] === 'gtd_calendar_id');
  if (!hasGtdCalendarId) {
    db.run('ALTER TABLE users ADD COLUMN gtd_calendar_id TEXT');
    db.run('ALTER TABLE users ADD COLUMN google_calendar_scopes TEXT');
  }

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

  // Habits tables
  db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      frequency TEXT DEFAULT 'daily' CHECK(frequency IN ('daily', 'weekly', 'specific_days')),
      target_days TEXT,
      category TEXT,
      color TEXT DEFAULT '#3b82f6',
      user_id INTEGER REFERENCES users(id),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_unique ON habit_logs(habit_id, completed_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, completed_date)`);

  // Weekly reviews table
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      inbox_count_at_start INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      tasks_moved INTEGER DEFAULT 0,
      tasks_deleted INTEGER DEFAULT 0,
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reviews_user ON weekly_reviews(user_id, completed_at)`);

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
