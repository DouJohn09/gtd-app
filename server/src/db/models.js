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
      // For next_actions, filter out queued tasks from sequential projects
      if (list === 'next_actions') {
        const stmt = db.prepare(`
          SELECT t.*, p.name as project_name FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.list = 'next_actions' AND t.user_id = ?
            AND (
              p.execution_mode IS NULL
              OR p.execution_mode = 'parallel'
              OR t.position = (
                SELECT MIN(t2.position) FROM tasks t2
                WHERE t2.project_id = t.project_id
                  AND t2.list = 'next_actions' AND t2.user_id = ?
              )
            )
          ORDER BY t.priority DESC, t.created_at DESC
        `);
        stmt.bind([userId, userId]);
        return rowsToObjects(stmt);
      }
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
    const stmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY position ASC, created_at ASC`);
    stmt.bind([projectId, userId]);
    return rowsToObjects(stmt);
  },

  create(task, userId) {
    const db = getDb();

    // Auto-assign position for tasks in a project
    let position = task.position ?? 0;
    if (task.project_id && position === 0) {
      const maxResult = db.exec(`SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE project_id = ${task.project_id} AND user_id = ${userId}`);
      position = (maxResult[0]?.values[0]?.[0] ?? -1) + 1;
    }

    db.run(`
      INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, energy_level, time_estimate, priority, is_daily_focus, position, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      position,
      userId
    ]);

    const result = db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0];

    saveDb();
    return this.getById(id, userId);
  },

  update(id, updates, userId) {
    const db = getDb();
    const allowedFields = ['title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person', 'due_date', 'energy_level', 'time_estimate', 'priority', 'is_daily_focus', 'completed_at', 'position'];
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
    const task = this.getById(id, userId);
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    saveDb();

    // Auto-promote next task if deleted from sequential project
    if (task && task.project_id) {
      const projStmt = db.prepare('SELECT execution_mode FROM projects WHERE id = ? AND user_id = ?');
      projStmt.bind([task.project_id, userId]);
      const project = rowToObject(projStmt);

      if (project?.execution_mode === 'sequential') {
        const nextStmt = db.prepare(
          "SELECT id, list FROM tasks WHERE project_id = ? AND user_id = ? AND list != 'completed' ORDER BY position ASC LIMIT 1"
        );
        nextStmt.bind([task.project_id, userId]);
        const nextTask = rowToObject(nextStmt);
        if (nextTask && nextTask.list !== 'next_actions') {
          this.update(nextTask.id, { list: 'next_actions' }, userId);
        }
      }
    }

    return { changes: 1 };
  },

  complete(id, userId) {
    const task = this.getById(id, userId);
    const result = this.update(id, { list: 'completed', completed_at: new Date().toISOString(), is_daily_focus: 0 }, userId);

    // Auto-promote next task in sequential projects
    if (task && task.project_id) {
      const db = getDb();
      const projStmt = db.prepare('SELECT execution_mode FROM projects WHERE id = ? AND user_id = ?');
      projStmt.bind([task.project_id, userId]);
      const project = rowToObject(projStmt);

      if (project?.execution_mode === 'sequential') {
        const nextStmt = db.prepare(
          "SELECT id FROM tasks WHERE project_id = ? AND user_id = ? AND list != 'completed' ORDER BY position ASC LIMIT 1"
        );
        nextStmt.bind([task.project_id, userId]);
        const nextTask = rowToObject(nextStmt);
        if (nextTask) {
          this.update(nextTask.id, { list: 'next_actions' }, userId);
        }
      }
    }

    return result;
  },

  reorderTasks(projectId, taskIds, userId) {
    const db = getDb();
    taskIds.forEach((taskId, index) => {
      db.run(
        'UPDATE tasks SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND user_id = ?',
        [index, taskId, projectId, userId]
      );
    });
    saveDb();
    return this.getByProject(projectId, userId);
  },

  getStats(userId) {
    const db = getDb();
    const getCount = (list) => {
      if (list === 'next_actions') {
        const stmt = db.prepare(`
          SELECT COUNT(*) as cnt FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE t.list = 'next_actions' AND t.user_id = ?
            AND (
              p.execution_mode IS NULL
              OR p.execution_mode = 'parallel'
              OR t.position = (
                SELECT MIN(t2.position) FROM tasks t2
                WHERE t2.project_id = t.project_id
                  AND t2.list = 'next_actions' AND t2.user_id = ?
              )
            )
        `);
        stmt.bind([userId, userId]);
        const row = rowToObject(stmt);
        return row ? row.cnt : 0;
      }
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

      let nextAction;
      if (p.execution_mode === 'sequential') {
        const nextStmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND list != 'completed' AND user_id = ? ORDER BY position ASC LIMIT 1`);
        nextStmt.bind([p.id, userId]);
        nextAction = rowToObject(nextStmt);
      } else {
        const nextStmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND list = 'next_actions' AND user_id = ? ORDER BY priority DESC LIMIT 1`);
        nextStmt.bind([p.id, userId]);
        nextAction = rowToObject(nextStmt);
      }

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
    db.run('INSERT INTO projects (name, description, outcome, execution_mode, user_id) VALUES (?, ?, ?, ?, ?)', [
      project.name,
      project.description || null,
      project.outcome || null,
      project.execution_mode || 'parallel',
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

    // When toggling to sequential, auto-assign positions if all are 0
    if (updates.execution_mode === 'sequential') {
      const tasks = TaskModel.getByProject(id, userId);
      const incomplete = tasks.filter(t => t.list !== 'completed');
      const allZero = incomplete.every(t => !t.position);
      if (allZero && incomplete.length > 1) {
        incomplete.forEach((t, i) => {
          db.run('UPDATE tasks SET position = ? WHERE id = ?', [i, t.id]);
        });
      }
    }

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
