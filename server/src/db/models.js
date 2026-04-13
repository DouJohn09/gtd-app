import { getDb, saveDb } from './schema.js';

function rowsToObjects(stmt) {
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

function rowToObject(stmt) {
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export const TaskModel = {
  getAll(list = null, userId) {
    const db = getDb();
    if (list) {
      const orderBy = list === 'completed' ? 't.completed_at DESC' : 't.priority DESC, t.created_at DESC';
      const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.list = ? AND t.user_id = ? ORDER BY ${orderBy}`);
      stmt.bind([list, userId]);
      return rowsToObjects(stmt);
    } else {
      const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.user_id = ? ORDER BY t.priority DESC, t.created_at DESC`);
      stmt.bind([userId]);
      return rowsToObjects(stmt);
    }
  },

  getById(id, userId) {
    const db = getDb();
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ? AND t.user_id = ?`);
    stmt.bind([id, userId]);
    return rowToObject(stmt);
  },

  getDailyFocus(userId) {
    const db = getDb();
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.is_daily_focus = 1 AND t.list != 'completed' AND t.user_id = ? ORDER BY t.priority DESC`);
    stmt.bind([userId]);
    return rowsToObjects(stmt);
  },

  getByProject(projectId, userId) {
    const db = getDb();
    const stmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY list, priority DESC`);
    stmt.bind([projectId, userId]);
    return rowsToObjects(stmt);
  },

  create(task, userId) {
    const db = getDb();
    db.run(`
      INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, energy_level, time_estimate, priority, is_daily_focus, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      task.title,
      task.notes || null,
      task.list || 'inbox',
      task.context || null,
      task.project_id || null,
      task.waiting_for_person || null,
      task.due_date || null,
      task.energy_level || null,
      task.time_estimate || null,
      task.priority || 0,
      task.is_daily_focus || 0,
      userId
    ]);

    const result = db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0];

    saveDb();
    return this.getById(id, userId);
  },

  update(id, updates, userId) {
    const db = getDb();
    const allowedFields = ['title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person', 'due_date', 'energy_level', 'time_estimate', 'priority', 'is_daily_focus', 'completed_at'];
    const fields = Object.keys(updates).filter(k => allowedFields.includes(k) && updates[k] !== undefined);

    if (fields.length === 0) return this.getById(id, userId);

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    values.push(id, userId);

    try {
      db.run(`UPDATE tasks SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, values);
      saveDb();
    } catch (err) {
      console.error('Update error:', err);
      throw err;
    }
    return this.getById(id, userId);
  },

  delete(id, userId) {
    const db = getDb();
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
    return { changes: 1 };
  },

  complete(id, userId) {
    return this.update(id, { list: 'completed', completed_at: new Date().toISOString(), is_daily_focus: 0 }, userId);
  },

  getStats(userId) {
    const db = getDb();
    const getCount = (list) => {
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE list = ? AND user_id = ?`);
      stmt.bind([list, userId]);
      const row = rowToObject(stmt);
      return row ? row.cnt : 0;
    };
    const getDailyFocusCount = () => {
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE is_daily_focus = 1 AND list != 'completed' AND user_id = ?`);
      stmt.bind([userId]);
      const row = rowToObject(stmt);
      return row ? row.cnt : 0;
    };
    const getCompletedTodayCount = () => {
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE list = 'completed' AND date(completed_at) = date('now') AND user_id = ?`);
      stmt.bind([userId]);
      const row = rowToObject(stmt);
      return row ? row.cnt : 0;
    };
    return {
      inbox: getCount('inbox'),
      next_actions: getCount('next_actions'),
      waiting_for: getCount('waiting_for'),
      someday_maybe: getCount('someday_maybe'),
      daily_focus: getDailyFocusCount(),
      completed_today: getCompletedTodayCount()
    };
  }
};

export const ProjectModel = {
  getAll(userId) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY status, created_at DESC');
    stmt.bind([userId]);
    const projects = rowsToObjects(stmt);

    return projects.map(p => {
      const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE project_id = ? AND list != 'completed' AND user_id = ?`);
      countStmt.bind([p.id, userId]);
      const countRow = rowToObject(countStmt);
      const taskCount = countRow ? countRow.cnt : 0;

      const nextStmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND list = 'next_actions' AND user_id = ? ORDER BY priority DESC LIMIT 1`);
      nextStmt.bind([p.id, userId]);
      const nextAction = rowToObject(nextStmt);

      return { ...p, task_count: taskCount, next_action: nextAction };
    });
  },

  getById(id, userId) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?');
    stmt.bind([id, userId]);
    const project = rowToObject(stmt);
    if (project) {
      project.tasks = TaskModel.getByProject(id, userId);
    }
    return project;
  },

  create(project, userId) {
    const db = getDb();
    db.run('INSERT INTO projects (name, description, outcome, user_id) VALUES (?, ?, ?, ?)', [
      project.name,
      project.description || null,
      project.outcome || null,
      userId
    ]);

    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    saveDb();

    return this.getById(id, userId);
  },

  update(id, updates, userId) {
    const db = getDb();
    const fields = Object.keys(updates).filter(k => updates[k] !== undefined);
    if (fields.length === 0) return this.getById(id, userId);

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    values.push(id, userId);

    db.run(`UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, values);
    saveDb();
    return this.getById(id, userId);
  },

  delete(id, userId) {
    const db = getDb();
    db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();
    return { changes: 1 };
  }
};
