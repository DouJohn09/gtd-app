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
  getAll(list = null) {
    const db = getDb();
    const sql = list
      ? `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.list = ? ORDER BY t.priority DESC, t.created_at DESC`
      : `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id ORDER BY t.priority DESC, t.created_at DESC`;
    const stmt = list ? db.prepare(sql) : db.prepare(sql);
    if (list) stmt.bind([list]);
    return rowsToObjects(stmt);
  },

  getById(id) {
    const db = getDb();
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`);
    stmt.bind([id]);
    return rowToObject(stmt);
  },

  getDailyFocus() {
    const db = getDb();
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.is_daily_focus = 1 AND t.list != 'completed' ORDER BY t.priority DESC`);
    return rowsToObjects(stmt);
  },

  getByProject(projectId) {
    const db = getDb();
    const stmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY list, priority DESC`);
    stmt.bind([projectId]);
    return rowsToObjects(stmt);
  },

  create(task) {
    const db = getDb();
    db.run(`
      INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, energy_level, time_estimate, priority, is_daily_focus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      task.is_daily_focus || 0
    ]);
    
    // Get ID immediately after insert, before saveDb
    const result = db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0];
    
    saveDb();
    
    // Fetch the created task
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  update(id, updates) {
    const db = getDb();
    // Include all fields that are present in updates object (including null values)
    const allowedFields = ['title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person', 'due_date', 'energy_level', 'time_estimate', 'priority', 'is_daily_focus', 'completed_at'];
    const fields = Object.keys(updates).filter(k => allowedFields.includes(k) && updates[k] !== undefined);
    
    if (fields.length === 0) return this.getById(id);
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    values.push(id);
    
    try {
      db.run(`UPDATE tasks SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
      saveDb();
    } catch (err) {
      console.error('Update error:', err);
      throw err;
    }
    return this.getById(id);
  },

  delete(id) {
    const db = getDb();
    db.run('DELETE FROM tasks WHERE id = ?', [id]);
    saveDb();
    return { changes: 1 };
  },

  complete(id) {
    return this.update(id, { list: 'completed', completed_at: new Date().toISOString(), is_daily_focus: 0 });
  },

  getStats() {
    const db = getDb();
    const getCount = (sql) => {
      const result = db.exec(sql);
      return result.length > 0 ? result[0].values[0][0] : 0;
    };
    return {
      inbox: getCount('SELECT COUNT(*) FROM tasks WHERE list = "inbox"'),
      next_actions: getCount('SELECT COUNT(*) FROM tasks WHERE list = "next_actions"'),
      waiting_for: getCount('SELECT COUNT(*) FROM tasks WHERE list = "waiting_for"'),
      someday_maybe: getCount('SELECT COUNT(*) FROM tasks WHERE list = "someday_maybe"'),
      daily_focus: getCount('SELECT COUNT(*) FROM tasks WHERE is_daily_focus = 1 AND list != "completed"'),
      completed_today: getCount('SELECT COUNT(*) FROM tasks WHERE list = "completed" AND date(completed_at) = date("now")')
    };
  }
};

export const ProjectModel = {
  getAll() {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects ORDER BY status, created_at DESC');
    const projects = rowsToObjects(stmt);
    
    return projects.map(p => {
      const countResult = db.exec(`SELECT COUNT(*) FROM tasks WHERE project_id = ${p.id} AND list != 'completed'`);
      const taskCount = countResult.length > 0 ? countResult[0].values[0][0] : 0;
      
      const nextStmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND list = 'next_actions' ORDER BY priority DESC LIMIT 1`);
      nextStmt.bind([p.id]);
      const nextAction = rowToObject(nextStmt);
      
      return { ...p, task_count: taskCount, next_action: nextAction };
    });
  },

  getById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    stmt.bind([id]);
    const project = rowToObject(stmt);
    if (project) {
      project.tasks = TaskModel.getByProject(id);
    }
    return project;
  },

  create(project) {
    const db = getDb();
    db.run('INSERT INTO projects (name, description, outcome) VALUES (?, ?, ?)', [
      project.name,
      project.description || null,
      project.outcome || null
    ]);
    
    // Get ID before saveDb
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    saveDb();
    
    return this.getById(id);
  },

  update(id, updates) {
    const db = getDb();
    const fields = Object.keys(updates).filter(k => updates[k] !== undefined);
    if (fields.length === 0) return this.getById(id);
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    values.push(id);
    
    db.run(`UPDATE projects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    saveDb();
    return this.getById(id);
  },

  delete(id) {
    const db = getDb();
    db.run('DELETE FROM projects WHERE id = ?', [id]);
    saveDb();
    return { changes: 1 };
  }
};
