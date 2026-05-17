// Initial Cleartable schema, ported from the legacy sql.js schema.
// Differences vs. SQLite version:
//   - INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
//   - INTEGER for booleans               -> BOOLEAN
//   - DATETIME DEFAULT CURRENT_TIMESTAMP -> TIMESTAMPTZ DEFAULT NOW()
//   - DATE stays DATE (now a real type, not TEXT)
//   - All inline CHECK / UNIQUE / REFERENCES constraints preserved
//   - All indexes preserved
// After this migration runs, the schema matches what models.js expects today,
// minus the boolean coercion changes (is_daily_focus, habits.active).

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      google_calendar_access_token TEXT,
      google_calendar_refresh_token TEXT,
      google_calendar_token_expiry TEXT,
      gtd_calendar_id TEXT,
      google_calendar_scopes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_users_google_id ON users(google_id);`);

  pgm.sql(`
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold')),
      outcome TEXT,
      execution_mode TEXT DEFAULT 'parallel',
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_projects_user ON projects(user_id);`);

  pgm.sql(`
    CREATE TABLE tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      list TEXT DEFAULT 'inbox' CHECK (list IN ('inbox', 'next_actions', 'waiting_for', 'someday_maybe', 'completed')),
      context TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      waiting_for_person TEXT,
      due_date DATE,
      start_date DATE,
      scheduled_time TEXT,
      duration INTEGER,
      energy_level TEXT CHECK (energy_level IN ('low', 'medium', 'high')),
      time_estimate INTEGER,
      priority INTEGER DEFAULT 0,
      is_daily_focus BOOLEAN DEFAULT false,
      position INTEGER DEFAULT 0,
      recurrence_rule TEXT,
      recurrence_interval INTEGER DEFAULT 1,
      recurrence_days TEXT,
      recurrence_type TEXT DEFAULT 'absolute',
      google_event_id TEXT,
      completed_at TIMESTAMPTZ,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_tasks_list           ON tasks(list);`);
  pgm.sql(`CREATE INDEX idx_tasks_project        ON tasks(project_id);`);
  pgm.sql(`CREATE INDEX idx_tasks_daily          ON tasks(is_daily_focus);`);
  pgm.sql(`CREATE INDEX idx_tasks_user           ON tasks(user_id);`);
  pgm.sql(`CREATE INDEX idx_tasks_user_due_date  ON tasks(user_id, due_date);`);
  pgm.sql(`CREATE INDEX idx_tasks_position       ON tasks(project_id, position);`);
  pgm.sql(`CREATE INDEX idx_tasks_start_date     ON tasks(user_id, start_date);`);

  pgm.sql(`
    CREATE TABLE contexts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX idx_contexts_name_user ON contexts(name, user_id);`);

  pgm.sql(`
    CREATE TABLE habits (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'specific_days')),
      target_days TEXT,
      category TEXT,
      color TEXT DEFAULT '#3b82f6',
      user_id INTEGER REFERENCES users(id),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_habits_user ON habits(user_id);`);

  pgm.sql(`
    CREATE TABLE habit_logs (
      id SERIAL PRIMARY KEY,
      habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX idx_habit_logs_unique     ON habit_logs(habit_id, completed_date);`);
  pgm.sql(`CREATE INDEX        idx_habit_logs_user_date  ON habit_logs(user_id, completed_date);`);

  pgm.sql(`
    CREATE TABLE weekly_reviews (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      inbox_count_at_start INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      tasks_moved INTEGER DEFAULT 0,
      tasks_deleted INTEGER DEFAULT 0,
      ai_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_reviews_user ON weekly_reviews(user_id, completed_at);`);

  pgm.sql(`
    CREATE TABLE custom_lists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'list',
      color TEXT DEFAULT 'violet',
      user_id INTEGER REFERENCES users(id),
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  pgm.sql(`CREATE INDEX idx_custom_lists_user ON custom_lists(user_id, position);`);

  pgm.sql(`
    CREATE TABLE list_items (
      id SERIAL PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES custom_lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT,
      url TEXT,
      status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
      rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
      position INTEGER DEFAULT 0,
      linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);
  pgm.sql(`CREATE INDEX idx_list_items_list ON list_items(list_id, position);`);
  pgm.sql(`CREATE INDEX idx_list_items_user ON list_items(user_id);`);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS list_items      CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS custom_lists    CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS weekly_reviews  CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS habit_logs      CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS habits          CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS contexts        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS tasks           CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS projects        CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS users           CASCADE;`);
};
