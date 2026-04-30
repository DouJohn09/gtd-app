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
            AND (t.start_date IS NULL OR t.start_date <= date('now'))
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
      const deferFilter = list === 'completed' ? '' : " AND (t.start_date IS NULL OR t.start_date <= date('now'))";
      const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.list = ? AND t.user_id = ?${deferFilter} ORDER BY ${orderBy}`);
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
    const stmt = db.prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE (t.is_daily_focus = 1 OR t.due_date <= date('now')) AND t.list != 'completed' AND t.list != 'someday_maybe' AND t.user_id = ? AND (t.start_date IS NULL OR t.start_date <= date('now')) ORDER BY t.priority DESC, t.due_date ASC`);
    stmt.bind([userId]);
    return rowsToObjects(stmt);
  },

  getByProject(projectId, userId) {
    const db = getDb();
    const stmt = db.prepare(`SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY position ASC, created_at ASC`);
    stmt.bind([projectId, userId]);
    return rowsToObjects(stmt);
  },

  getDeferred(list, userId) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.list = ? AND t.user_id = ? AND t.start_date > date('now')
      ORDER BY t.start_date ASC, t.priority DESC
    `);
    stmt.bind([list, userId]);
    return rowsToObjects(stmt);
  },

  getByDateRange(startDate, endDate, userId) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ? AND t.list != 'completed'
        AND (
          (t.due_date >= ? AND t.due_date <= ?)
          OR (t.start_date >= ? AND t.start_date <= ?)
        )
      ORDER BY COALESCE(t.start_date, t.due_date) ASC, t.priority DESC
    `);
    stmt.bind([userId, startDate, endDate, startDate, endDate]);
    return rowsToObjects(stmt);
  },

  getUnscheduled(userId) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ? AND (t.due_date IS NULL OR t.due_date = '') AND t.list != 'completed'
      ORDER BY t.priority DESC, t.created_at DESC
    `);
    stmt.bind([userId]);
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
      INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, start_date, scheduled_time, duration, energy_level, time_estimate, priority, is_daily_focus, position, recurrence_rule, recurrence_interval, recurrence_days, recurrence_type, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      task.title,
      task.notes || null,
      task.list || 'inbox',
      task.context || null,
      task.project_id || null,
      task.waiting_for_person || null,
      task.due_date || null,
      task.start_date || null,
      task.scheduled_time || null,
      task.duration || null,
      task.energy_level || null,
      task.time_estimate || null,
      task.priority || 0,
      task.is_daily_focus || 0,
      position,
      task.recurrence_rule || null,
      task.recurrence_interval || 1,
      task.recurrence_days || null,
      task.recurrence_type || 'absolute',
      userId
    ]);

    const result = db.exec("SELECT last_insert_rowid() as id");
    const id = result[0].values[0][0];

    saveDb();
    return this.getById(id, userId);
  },

  update(id, updates, userId) {
    const db = getDb();
    const allowedFields = ['title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person', 'due_date', 'start_date', 'scheduled_time', 'duration', 'energy_level', 'time_estimate', 'priority', 'is_daily_focus', 'completed_at', 'position', 'recurrence_rule', 'recurrence_interval', 'recurrence_days', 'recurrence_type'];
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

    if (task && task.recurrence_rule) {
      return this._completeRecurring(task, userId);
    }

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

  _completeRecurring(task, userId) {
    // Create a completed snapshot for history
    const db = getDb();
    db.run(`
      INSERT INTO tasks (title, notes, list, context, project_id, waiting_for_person, due_date, start_date, scheduled_time, duration, energy_level, time_estimate, priority, is_daily_focus, position, completed_at, user_id)
      VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `, [
      task.title, task.notes, task.context, task.project_id, task.waiting_for_person,
      task.due_date, task.start_date, task.scheduled_time, task.duration,
      task.energy_level, task.time_estimate,
      task.priority, task.position, new Date().toISOString(), userId
    ]);
    saveDb();

    // Calculate next due date
    const nextDue = this._nextDueDate(task);
    const nextStart = task.start_date ? this._advanceDate(task.start_date, task) : null;

    this.update(task.id, {
      due_date: nextDue,
      start_date: nextStart,
      is_daily_focus: 0,
      completed_at: null,
    }, userId);

    return this.getById(task.id, userId);
  },

  _nextDueDate(task) {
    const base = task.recurrence_type === 'relative'
      ? new Date().toISOString().split('T')[0]
      : (task.due_date || new Date().toISOString().split('T')[0]);
    let next = this._advanceDate(base, task);
    if (task.recurrence_type !== 'relative') {
      const today = new Date().toISOString().split('T')[0];
      while (next <= today) {
        next = this._advanceDate(next, task);
      }
    }
    return next;
  },

  _advanceDate(dateStr, task) {
    const d = new Date(dateStr + 'T12:00:00');
    const interval = task.recurrence_interval || 1;

    switch (task.recurrence_rule) {
      case 'daily':
        d.setDate(d.getDate() + interval);
        break;
      case 'weekdays': {
        let added = 0;
        while (added < interval) {
          d.setDate(d.getDate() + 1);
          const day = d.getDay();
          if (day !== 0 && day !== 6) added++;
        }
        break;
      }
      case 'weekly':
        d.setDate(d.getDate() + 7 * interval);
        break;
      case 'monthly':
        d.setMonth(d.getMonth() + interval);
        break;
      case 'yearly':
        d.setFullYear(d.getFullYear() + interval);
        break;
      case 'custom': {
        if (task.recurrence_days) {
          const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
          const targetDays = task.recurrence_days.split(',').map(x => dayMap[x.trim()]).filter(x => x !== undefined).sort((a, b) => a - b);
          if (targetDays.length) {
            const currentDay = d.getDay();
            const next = targetDays.find(x => x > currentDay) ?? targetDays[0];
            let daysToAdd = next - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7 * interval;
            d.setDate(d.getDate() + daysToAdd);
          } else {
            d.setDate(d.getDate() + interval);
          }
        } else {
          d.setDate(d.getDate() + interval);
        }
        break;
      }
      default:
        d.setDate(d.getDate() + 1);
    }

    return d.toISOString().split('T')[0];
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
            AND (t.start_date IS NULL OR t.start_date <= date('now'))
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
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE list = ? AND user_id = ? AND (start_date IS NULL OR start_date <= date('now'))`);
      stmt.bind([list, userId]);
      const row = rowToObject(stmt);
      return row ? row.cnt : 0;
    };
    const getDailyFocusCount = () => {
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE (is_daily_focus = 1 OR due_date <= date('now')) AND list != 'completed' AND list != 'someday_maybe' AND user_id = ? AND (start_date IS NULL OR start_date <= date('now'))`);
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

export const WeeklyReviewModel = {
  getHistory(userId, limit = 10) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM weekly_reviews WHERE user_id = ? ORDER BY completed_at DESC LIMIT ?');
    stmt.bind([userId, limit]);
    return rowsToObjects(stmt);
  },

  getLastReview(userId) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM weekly_reviews WHERE user_id = ? ORDER BY completed_at DESC LIMIT 1');
    stmt.bind([userId]);
    return rowToObject(stmt);
  },

  getStreak(userId) {
    const db = getDb();
    const stmt = db.prepare('SELECT completed_at FROM weekly_reviews WHERE user_id = ? ORDER BY completed_at DESC');
    stmt.bind([userId]);
    const reviews = rowsToObjects(stmt);
    if (reviews.length === 0) return 0;

    let streak = 1;
    for (let i = 1; i < reviews.length; i++) {
      const prev = new Date(reviews[i - 1].completed_at);
      const curr = new Date(reviews[i].completed_at);
      const daysBetween = (prev - curr) / (1000 * 60 * 60 * 24);
      if (daysBetween <= 10) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  },

  getCompletedTasksSince(userId, since) {
    const db = getDb();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM tasks WHERE list = 'completed' AND completed_at >= ? AND user_id = ?");
    stmt.bind([since, userId]);
    const row = rowToObject(stmt);
    return row ? row.cnt : 0;
  },

  getStaleItems(userId, days = 14) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.list IN ('next_actions', 'waiting_for', 'someday_maybe')
        AND t.user_id = ?
        AND t.updated_at < datetime('now', '-' || ? || ' days')
      ORDER BY t.updated_at ASC
      LIMIT 20
    `);
    stmt.bind([userId, days]);
    return rowsToObjects(stmt);
  },

  create(data, userId) {
    const db = getDb();
    db.run(`
      INSERT INTO weekly_reviews (user_id, inbox_count_at_start, tasks_completed, tasks_moved, tasks_deleted, ai_summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      userId,
      data.inboxCountAtStart || 0,
      data.tasksCompleted || 0,
      data.tasksMoved || 0,
      data.tasksDeleted || 0,
      data.aiSummary ? JSON.stringify(data.aiSummary) : null
    ]);
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    saveDb();
    const stmt = db.prepare('SELECT * FROM weekly_reviews WHERE id = ?');
    stmt.bind([id]);
    return rowToObject(stmt);
  }
};
