import { pool } from './pool.js';
import { todayInTz } from '../lib/dateTime.js';

// Default "today" when a caller doesn't supply a tz-resolved date — UTC, i.e.
// the previous behavior. Route handlers pass req.today (user's local day).
const utcToday = () => todayInTz('UTC');

// Boolean coercion for fields that some callers still pass as 0/1
// (legacy from the sql.js INT-as-boolean convention). The DB columns are
// real BOOLEAN now, so pg rejects 0/1 — normalize at the model boundary.
function coerceBooleans(updates) {
  const out = { ...updates };
  if ('is_daily_focus' in out && out.is_daily_focus !== undefined) {
    out.is_daily_focus = !!out.is_daily_focus;
  }
  if ('active' in out && out.active !== undefined) {
    out.active = !!out.active;
  }
  return out;
}

// Ownership guards: a client can send any FK id (project_id, list_id), and
// SERIAL ids are enumerable — so verify the referenced row belongs to the
// caller before binding to it, or a task/item can point at another user's
// project/list (leaking its name via JOINs, or getting cascade-deleted with it).
async function projectBelongsTo(projectId, userId) {
  if (!projectId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return rows.length > 0;
}

async function listBelongsTo(listId, userId) {
  if (!listId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM custom_lists WHERE id = $1 AND user_id = $2',
    [listId, userId]
  );
  return rows.length > 0;
}

export const TaskModel = {
  async getAll(list = null, userId, today = utcToday()) {
    if (list === 'next_actions') {
      const sql = `
        SELECT t.*, p.name as project_name FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
        WHERE t.list = 'next_actions' AND t.user_id = $1
          AND (t.start_date IS NULL OR t.start_date <= $2::date)
          AND (
            p.execution_mode IS NULL
            OR p.execution_mode = 'parallel'
            OR t.position = (
              SELECT MIN(t2.position) FROM tasks t2
              WHERE t2.project_id = t.project_id
                AND t2.list = 'next_actions' AND t2.user_id = $1
            )
          )
        ORDER BY t.priority DESC, t.created_at DESC
      `;
      const { rows } = await pool.query(sql, [userId, today]);
      return rows;
    }
    if (list) {
      const orderBy = list === 'completed' ? 't.completed_at DESC' : 't.priority DESC, t.created_at DESC';
      const deferFilter = list === 'completed' ? '' : " AND (t.start_date IS NULL OR t.start_date <= $3::date)";
      const sql = `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id WHERE t.list = $1 AND t.user_id = $2${deferFilter} ORDER BY ${orderBy}`;
      const params = list === 'completed' ? [list, userId] : [list, userId, today];
      const { rows } = await pool.query(sql, params);
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id WHERE t.user_id = $1 ORDER BY t.priority DESC, t.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async getById(id, userId) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async getDailyFocus(userId, today = utcToday()) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id WHERE (t.is_daily_focus = true OR t.due_date <= $2::date) AND t.list != 'completed' AND t.list != 'someday_maybe' AND t.user_id = $1 AND (t.start_date IS NULL OR t.start_date <= $2::date) ORDER BY t.priority DESC, t.due_date ASC`,
      [userId, today]
    );
    return rows;
  },

  async getByProject(projectId, userId) {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY position ASC, created_at ASC`,
      [projectId, userId]
    );
    return rows;
  },

  async getDeferred(list, userId, today = utcToday()) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
       WHERE t.list = $1 AND t.user_id = $2 AND t.start_date > $3::date
       ORDER BY t.start_date ASC, t.priority DESC`,
      [list, userId, today]
    );
    return rows;
  },

  async getByDateRange(startDate, endDate, userId) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
       WHERE t.user_id = $1 AND t.list != 'completed'
         AND (
           (t.due_date >= $2 AND t.due_date <= $3)
           OR (t.start_date >= $2 AND t.start_date <= $3)
         )
       ORDER BY COALESCE(t.start_date, t.due_date) ASC, t.priority DESC`,
      [userId, startDate, endDate]
    );
    return rows;
  },

  async getUnscheduled(userId) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
       WHERE t.user_id = $1 AND t.due_date IS NULL AND t.list != 'completed'
       ORDER BY t.priority DESC, t.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async create(task, userId) {
    // Only bind project_id if the project belongs to the caller (see guards above).
    if (task.project_id && !(await projectBelongsTo(task.project_id, userId))) {
      task = { ...task, project_id: null };
    }
    // Auto-assign position for tasks in a project
    let position = task.position ?? 0;
    if (task.project_id && position === 0) {
      const { rows: maxRows } = await pool.query(
        'SELECT COALESCE(MAX(position), -1) AS max_pos FROM tasks WHERE project_id = $1 AND user_id = $2',
        [task.project_id, userId]
      );
      position = (maxRows[0]?.max_pos ?? -1) + 1;
    }

    const { rows } = await pool.query(
      `INSERT INTO tasks (
        title, notes, list, context, project_id, waiting_for_person,
        due_date, start_date, scheduled_time, duration, energy_level,
        time_estimate, priority, is_daily_focus, position,
        recurrence_rule, recurrence_interval, recurrence_days, recurrence_type, user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING id`,
      [
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
        !!task.is_daily_focus,
        position,
        task.recurrence_rule || null,
        task.recurrence_interval || 1,
        task.recurrence_days || null,
        task.recurrence_type || 'absolute',
        userId,
      ]
    );
    return this.getById(rows[0].id, userId);
  },

  async update(id, updates, userId) {
    const allowedFields = ['title', 'notes', 'list', 'context', 'project_id', 'waiting_for_person', 'due_date', 'start_date', 'scheduled_time', 'duration', 'energy_level', 'time_estimate', 'priority', 'is_daily_focus', 'completed_at', 'position', 'recurrence_rule', 'recurrence_interval', 'recurrence_days', 'recurrence_type'];
    // Reject a project_id the caller doesn't own (clearing to null is still allowed).
    if (updates.project_id && !(await projectBelongsTo(updates.project_id, userId))) {
      updates = { ...updates };
      delete updates.project_id;
    }
    const coerced = coerceBooleans(updates);
    const fields = Object.keys(coerced).filter(k => allowedFields.includes(k) && coerced[k] !== undefined);
    if (fields.length === 0) return this.getById(id, userId);

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map(f => coerced[f]);
    values.push(id, userId);
    const idIdx = values.length - 1;
    const userIdx = values.length;

    await pool.query(
      `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $${idIdx} AND user_id = $${userIdx}`,
      values
    );
    return this.getById(id, userId);
  },

  async delete(id, userId) {
    const task = await this.getById(id, userId);
    await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);

    // Auto-promote next task if deleted from sequential project
    if (task && task.project_id) {
      const { rows: projRows } = await pool.query(
        'SELECT execution_mode FROM projects WHERE id = $1 AND user_id = $2',
        [task.project_id, userId]
      );
      const project = projRows[0];
      if (project?.execution_mode === 'sequential') {
        const { rows: nextRows } = await pool.query(
          "SELECT id, list FROM tasks WHERE project_id = $1 AND user_id = $2 AND list != 'completed' ORDER BY position ASC LIMIT 1",
          [task.project_id, userId]
        );
        const nextTask = nextRows[0];
        if (nextTask && nextTask.list !== 'next_actions') {
          await this.update(nextTask.id, { list: 'next_actions' }, userId);
        }
      }
    }
    return { changes: 1 };
  },

  async complete(id, userId, today = utcToday()) {
    const task = await this.getById(id, userId);

    if (task && task.recurrence_rule) {
      return this._completeRecurring(task, userId, today);
    }

    const result = await this.update(id, { list: 'completed', completed_at: new Date().toISOString(), is_daily_focus: false }, userId);

    if (task && task.project_id) {
      const { rows: projRows } = await pool.query(
        'SELECT execution_mode FROM projects WHERE id = $1 AND user_id = $2',
        [task.project_id, userId]
      );
      const project = projRows[0];
      if (project?.execution_mode === 'sequential') {
        const { rows: nextRows } = await pool.query(
          "SELECT id FROM tasks WHERE project_id = $1 AND user_id = $2 AND list != 'completed' ORDER BY position ASC LIMIT 1",
          [task.project_id, userId]
        );
        const nextTask = nextRows[0];
        if (nextTask) {
          await this.update(nextTask.id, { list: 'next_actions' }, userId);
        }
      }
    }
    return result;
  },

  async _completeRecurring(task, userId, today = utcToday()) {
    // Create a completed snapshot for history
    await pool.query(
      `INSERT INTO tasks (
        title, notes, list, context, project_id, waiting_for_person,
        due_date, start_date, scheduled_time, duration, energy_level,
        time_estimate, priority, is_daily_focus, position, completed_at, user_id
      ) VALUES ($1,$2,'completed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15)`,
      [
        task.title, task.notes, task.context, task.project_id, task.waiting_for_person,
        task.due_date, task.start_date, task.scheduled_time, task.duration,
        task.energy_level, task.time_estimate, task.priority, task.position,
        new Date().toISOString(), userId,
      ]
    );

    const nextDue = this._nextDueDate(task, today);
    const nextStart = task.start_date ? this._advanceDate(task.start_date, task) : null;

    await this.update(task.id, {
      due_date: nextDue,
      start_date: nextStart,
      is_daily_focus: false,
      completed_at: null,
    }, userId);

    return this.getById(task.id, userId);
  },

  _nextDueDate(task, today = utcToday()) {
    const base = task.recurrence_type === 'relative'
      ? today
      : (task.due_date || today);
    let next = this._advanceDate(base, task);
    if (task.recurrence_type !== 'relative') {
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

  async reorderTasks(projectId, taskIds, userId) {
    // Run as a single transaction so all positions update atomically.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < taskIds.length; i++) {
        await client.query(
          'UPDATE tasks SET position = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3 AND user_id = $4',
          [i, taskIds[i], projectId, userId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getByProject(projectId, userId);
  },

  async getStats(userId, today = utcToday()) {
    const nextActionsSql = `
      SELECT COUNT(*)::int AS cnt FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
      WHERE t.list = 'next_actions' AND t.user_id = $1
        AND (t.start_date IS NULL OR t.start_date <= $2::date)
        AND (
          p.execution_mode IS NULL
          OR p.execution_mode = 'parallel'
          OR t.position = (
            SELECT MIN(t2.position) FROM tasks t2
            WHERE t2.project_id = t.project_id
              AND t2.list = 'next_actions' AND t2.user_id = $1
          )
        )
    `;
    const simpleCountSql = `
      SELECT COUNT(*)::int AS cnt FROM tasks
      WHERE list = $1 AND user_id = $2
        AND (start_date IS NULL OR start_date <= $3::date)
    `;
    const dailyFocusCountSql = `
      SELECT COUNT(*)::int AS cnt FROM tasks
      WHERE (is_daily_focus = true OR due_date <= $2::date)
        AND list != 'completed' AND list != 'someday_maybe' AND user_id = $1
        AND (start_date IS NULL OR start_date <= $2::date)
    `;
    const completedTodaySql = `
      SELECT COUNT(*)::int AS cnt FROM tasks
      WHERE list = 'completed' AND completed_at::date = $2::date AND user_id = $1
    `;

    const [inbox, nextActions, waiting, someday, dailyFocus, completedToday] = await Promise.all([
      pool.query(simpleCountSql, ['inbox', userId, today]),
      pool.query(nextActionsSql, [userId, today]),
      pool.query(simpleCountSql, ['waiting_for', userId, today]),
      pool.query(simpleCountSql, ['someday_maybe', userId, today]),
      pool.query(dailyFocusCountSql, [userId, today]),
      pool.query(completedTodaySql, [userId, today]),
    ]);

    return {
      inbox: inbox.rows[0]?.cnt ?? 0,
      next_actions: nextActions.rows[0]?.cnt ?? 0,
      waiting_for: waiting.rows[0]?.cnt ?? 0,
      someday_maybe: someday.rows[0]?.cnt ?? 0,
      daily_focus: dailyFocus.rows[0]?.cnt ?? 0,
      completed_today: completedToday.rows[0]?.cnt ?? 0,
    };
  },
};

export const ProjectModel = {
  async getAll(userId) {
    const { rows: projects } = await pool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY status, created_at DESC',
      [userId]
    );

    // Compute task_count + next_action per project in parallel
    return Promise.all(projects.map(async (p) => {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM tasks WHERE project_id = $1 AND list != 'completed' AND user_id = $2`,
        [p.id, userId]
      );
      const taskCount = countRows[0]?.cnt ?? 0;

      let nextAction;
      if (p.execution_mode === 'sequential') {
        const { rows } = await pool.query(
          `SELECT * FROM tasks WHERE project_id = $1 AND list != 'completed' AND user_id = $2 ORDER BY position ASC LIMIT 1`,
          [p.id, userId]
        );
        nextAction = rows[0] || null;
      } else {
        const { rows } = await pool.query(
          `SELECT * FROM tasks WHERE project_id = $1 AND list = 'next_actions' AND user_id = $2 ORDER BY priority DESC LIMIT 1`,
          [p.id, userId]
        );
        nextAction = rows[0] || null;
      }

      return { ...p, task_count: taskCount, next_action: nextAction };
    }));
  },

  async getById(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    const project = rows[0];
    if (project) {
      project.tasks = await TaskModel.getByProject(id, userId);
    }
    return project || null;
  },

  async create(project, userId) {
    const { rows } = await pool.query(
      'INSERT INTO projects (name, description, outcome, execution_mode, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [
        project.name,
        project.description || null,
        project.outcome || null,
        project.execution_mode || 'parallel',
        userId,
      ]
    );
    return this.getById(rows[0].id, userId);
  },

  async update(id, updates, userId) {
    const allowedFields = ['name', 'description', 'status', 'outcome', 'execution_mode'];
    const fields = Object.keys(updates).filter(k => allowedFields.includes(k) && updates[k] !== undefined);
    if (fields.length === 0) return this.getById(id, userId);

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map(f => updates[f]);
    values.push(id, userId);
    const idIdx = values.length - 1;
    const userIdx = values.length;

    await pool.query(
      `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $${idIdx} AND user_id = $${userIdx}`,
      values
    );

    // When toggling to sequential, auto-assign positions if all are 0
    if (updates.execution_mode === 'sequential') {
      const tasks = await TaskModel.getByProject(id, userId);
      const incomplete = tasks.filter(t => t.list !== 'completed');
      const allZero = incomplete.every(t => !t.position);
      if (allZero && incomplete.length > 1) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (let i = 0; i < incomplete.length; i++) {
            await client.query('UPDATE tasks SET position = $1 WHERE id = $2', [i, incomplete[i].id]);
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    }

    return this.getById(id, userId);
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    return { changes: 1 };
  },
};

export const WeeklyReviewModel = {
  async getHistory(userId, limit = 10) {
    const { rows } = await pool.query(
      'SELECT * FROM weekly_reviews WHERE user_id = $1 ORDER BY completed_at DESC LIMIT $2',
      [userId, limit]
    );
    return rows;
  },

  async getLastReview(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM weekly_reviews WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  async getStreak(userId) {
    const { rows: reviews } = await pool.query(
      'SELECT completed_at FROM weekly_reviews WHERE user_id = $1 ORDER BY completed_at DESC',
      [userId]
    );
    if (reviews.length === 0) return 0;

    let streak = 1;
    for (let i = 1; i < reviews.length; i++) {
      const prev = new Date(reviews[i - 1].completed_at);
      const curr = new Date(reviews[i].completed_at);
      const daysBetween = (prev - curr) / (1000 * 60 * 60 * 24);
      if (daysBetween <= 10) streak++;
      else break;
    }
    return streak;
  },

  async getCompletedTasksSince(userId, since) {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM tasks WHERE list = 'completed' AND completed_at >= $1 AND user_id = $2",
      [since, userId]
    );
    return rows[0]?.cnt ?? 0;
  },

  async getStaleItems(userId, days = 14) {
    const { rows } = await pool.query(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id AND p.user_id = t.user_id
       WHERE t.list IN ('next_actions', 'waiting_for', 'someday_maybe')
         AND t.user_id = $1
         AND t.updated_at < NOW() - ($2 * INTERVAL '1 day')
       ORDER BY t.updated_at ASC
       LIMIT 20`,
      [userId, days]
    );
    return rows;
  },

  async create(data, userId) {
    const { rows } = await pool.query(
      `INSERT INTO weekly_reviews (user_id, inbox_count_at_start, tasks_completed, tasks_moved, tasks_deleted, ai_summary)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        userId,
        data.inboxCountAtStart || 0,
        data.tasksCompleted || 0,
        data.tasksMoved || 0,
        data.tasksDeleted || 0,
        data.aiSummary ? JSON.stringify(data.aiSummary) : null,
      ]
    );
    return rows[0];
  },
};

export const CustomListModel = {
  async getAll(userId) {
    const { rows: lists } = await pool.query(
      'SELECT * FROM custom_lists WHERE user_id = $1 ORDER BY position ASC, created_at ASC',
      [userId]
    );
    return Promise.all(lists.map(async (l) => {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM list_items WHERE list_id = $1 AND user_id = $2 AND status != 'done'",
        [l.id, userId]
      );
      return { ...l, item_count: rows[0]?.cnt ?? 0 };
    }));
  },

  async getById(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM custom_lists WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rows[0] || null;
  },

  async create(data, userId) {
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM custom_lists WHERE user_id = $1',
      [userId]
    );
    const position = (maxRows[0]?.mp ?? -1) + 1;
    const { rows } = await pool.query(
      'INSERT INTO custom_lists (name, icon, color, position, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [data.name, data.icon || 'list', data.color || 'violet', position, userId]
    );
    return this.getById(rows[0].id, userId);
  },

  async update(id, updates, userId) {
    const allowed = ['name', 'icon', 'color'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k) && updates[k] !== undefined);
    if (fields.length === 0) return this.getById(id, userId);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...fields.map(f => updates[f]), id, userId];
    const idIdx = values.length - 1;
    const userIdx = values.length;
    await pool.query(
      `UPDATE custom_lists SET ${setClause} WHERE id = $${idIdx} AND user_id = $${userIdx}`,
      values
    );
    return this.getById(id, userId);
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM custom_lists WHERE id = $1 AND user_id = $2', [id, userId]);
    return { changes: 1 };
  },

  async reorder(listIds, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < listIds.length; i++) {
        await client.query(
          'UPDATE custom_lists SET position = $1 WHERE id = $2 AND user_id = $3',
          [i, listIds[i], userId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getAll(userId);
  },
};

export const ListItemModel = {
  async getByList(listId, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM list_items WHERE list_id = $1 AND user_id = $2 ORDER BY position ASC, created_at ASC',
      [listId, userId]
    );
    return rows;
  },

  async getById(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM list_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rows[0] || null;
  },

  async create(data, userId) {
    // Refuse to attach an item to a list the caller doesn't own.
    if (!(await listBelongsTo(data.list_id, userId))) return null;
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) AS mp FROM list_items WHERE list_id = $1 AND user_id = $2',
      [data.list_id, userId]
    );
    const position = (maxRows[0]?.mp ?? -1) + 1;
    const { rows } = await pool.query(
      'INSERT INTO list_items (list_id, title, notes, url, status, position, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [data.list_id, data.title, data.notes || null, data.url || null, data.status || 'todo', position, userId]
    );
    return this.getById(rows[0].id, userId);
  },

  async update(id, updates, userId) {
    const allowed = ['title', 'notes', 'url', 'status', 'rating', 'position', 'linked_task_id', 'completed_at'];
    // Auto-fill completed_at and clear rating based on status transitions
    if (updates.status === 'done' && !updates.completed_at) {
      updates = { ...updates, completed_at: new Date().toISOString() };
    }
    if (updates.status && updates.status !== 'done') {
      updates = { ...updates, completed_at: null, rating: null };
    }
    const fields = Object.keys(updates).filter(k => allowed.includes(k) && updates[k] !== undefined);
    if (fields.length === 0) return this.getById(id, userId);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = [...fields.map(f => updates[f]), id, userId];
    const idIdx = values.length - 1;
    const userIdx = values.length;
    await pool.query(
      `UPDATE list_items SET ${setClause} WHERE id = $${idIdx} AND user_id = $${userIdx}`,
      values
    );
    return this.getById(id, userId);
  },

  async delete(id, userId) {
    await pool.query('DELETE FROM list_items WHERE id = $1 AND user_id = $2', [id, userId]);
    return { changes: 1 };
  },

  async reorder(listId, itemIds, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < itemIds.length; i++) {
        await client.query(
          'UPDATE list_items SET position = $1 WHERE id = $2 AND list_id = $3 AND user_id = $4',
          [i, itemIds[i], listId, userId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getByList(listId, userId);
  },

  async promoteToTask(id, userId) {
    const item = await this.getById(id, userId);
    if (!item) return null;
    if (item.linked_task_id) return { item, task: null, alreadyLinked: true };
    const task = await TaskModel.create({ title: item.title, notes: item.notes || null, list: 'next_actions' }, userId);
    await this.update(id, { linked_task_id: task.id }, userId);
    return { item: await this.getById(id, userId), task };
  },
};
