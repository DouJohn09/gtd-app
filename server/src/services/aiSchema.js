// Lightweight output validation for AI JSON responses. Each validator first
// COERCES common LLM slop in place (string "null" → null, numeric strings →
// numbers), then returns an array of problem strings. A non-empty array
// triggers one "repair" round-trip in complete() before falling back to the
// next provider — so validators should only report problems a model can fix
// by re-emitting the JSON, not stylistic nits.

const LISTS = ['inbox', 'next_actions', 'waiting_for', 'someday_maybe'];
const CONFIDENCE = ['high', 'medium', 'low'];
const ENERGY = ['low', 'medium', 'high'];
const RECURRENCE = ['daily', 'weekly', 'monthly', 'yearly', 'weekdays', 'custom'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// "null"/"" → null; "3" → 3 for numeric fields. Mutates obj.
function coerce(obj, field, { numeric = false } = {}) {
  if (!(field in obj)) return;
  let v = obj[field];
  if (v === 'null' || v === 'none' || v === '') v = null;
  if (numeric && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) v = Number(v);
  obj[field] = v;
}

function checkEnum(obj, field, allowed, problems, { nullable = true, label = '' } = {}) {
  coerce(obj, field);
  const v = obj[field];
  if (v == null) {
    if (!nullable) problems.push(`${label}${field} is required and must be one of: ${allowed.join('|')}`);
    return;
  }
  if (!allowed.includes(v)) problems.push(`${label}${field} is "${v}" but must be one of: ${allowed.join('|')}${nullable ? ' or null' : ''}`);
}

function checkPriority(obj, problems, label = '') {
  coerce(obj, 'priority', { numeric: true });
  const v = obj.priority;
  if (v == null) return;
  if (!Number.isInteger(v) || v < 1 || v > 5) problems.push(`${label}priority is "${v}" but must be an integer 1-5 (5 = most important) or null`);
}

function checkDate(obj, field, problems, label = '') {
  coerce(obj, field);
  const v = obj[field];
  if (v != null && !DATE_RE.test(v)) problems.push(`${label}${field} is "${v}" but must be YYYY-MM-DD or null`);
}

function checkConfidenceObject(obj, keys, problems, label = '') {
  if (obj.confidence == null || typeof obj.confidence !== 'object') return;
  for (const k of keys) {
    if (obj.confidence[k] != null && !CONFIDENCE.includes(obj.confidence[k])) {
      problems.push(`${label}confidence.${k} is "${obj.confidence[k]}" but must be high|medium|low`);
    }
  }
}

export function validateSmartCapture(r) {
  const problems = [];
  if (typeof r.title !== 'string' || !r.title.trim()) problems.push('title must be a non-empty string');
  checkEnum(r, 'list', LISTS, problems, { nullable: false });
  checkEnum(r, 'list_confidence', CONFIDENCE, problems, { nullable: false });
  checkEnum(r, 'energy_level', ENERGY, problems);
  checkPriority(r, problems);
  checkDate(r, 'due_date', problems);
  checkDate(r, 'start_date', problems);
  coerce(r, 'scheduled_time');
  if (r.scheduled_time != null && !TIME_RE.test(r.scheduled_time)) problems.push(`scheduled_time is "${r.scheduled_time}" but must be HH:MM 24-hour or null`);
  checkEnum(r, 'recurrence_rule', RECURRENCE, problems);
  coerce(r, 'time_estimate_minutes', { numeric: true });
  coerce(r, 'duration', { numeric: true });
  coerce(r, 'recurrence_interval', { numeric: true });
  coerce(r, 'waiting_for_person');
  coerce(r, 'project_name');
  coerce(r, 'context');
  coerce(r, 'possible_duplicate_of');
  return problems;
}

export function validateProcessInbox(taskCount) {
  return (r) => {
    const problems = [];
    if (!Array.isArray(r.processed_items)) return ['processed_items must be an array'];
    r.processed_items.forEach((item, i) => {
      const label = `processed_items[${i}].`;
      coerce(item, 'original_index', { numeric: true });
      if (!Number.isInteger(item.original_index) || item.original_index < 1 || item.original_index > taskCount) {
        problems.push(`${label}original_index must be an integer 1-${taskCount}`);
      }
      checkEnum(item, 'recommended_list', LISTS, problems, { nullable: false, label });
      checkEnum(item, 'energy_level', ENERGY, problems, { label });
      checkPriority(item, problems, label);
      checkDate(item, 'due_date', problems, label);
      coerce(item, 'context');
      coerce(item, 'project_name');
      coerce(item, 'waiting_for_person');
      coerce(item, 'time_estimate_minutes', { numeric: true });
      checkConfidenceObject(item, ['list', 'context', 'priority', 'due_date', 'project'], problems, label);
    });
    return problems;
  };
}

export function validateImportNotes(r) {
  const problems = [];
  if (!Array.isArray(r.items)) return ['items must be an array'];
  r.items.forEach((item, i) => {
    const label = `items[${i}].`;
    if (typeof item.title !== 'string' || !item.title.trim()) problems.push(`${label}title must be a non-empty string`);
    checkEnum(item, 'recommended_list', LISTS, problems, { nullable: false, label });
    checkEnum(item, 'energy_level', ENERGY, problems, { label });
    checkPriority(item, problems, label);
    checkDate(item, 'due_date', problems, label);
    coerce(item, 'context');
    coerce(item, 'project_name');
    coerce(item, 'waiting_for_person');
    coerce(item, 'time_estimate', { numeric: true });
    checkConfidenceObject(item, ['list', 'context', 'project', 'due_date', 'energy', 'time', 'waiting_for', 'daily_focus'], problems, label);
  });
  return problems;
}

export function validateDailyPriorities(taskCount) {
  return (r) => {
    const problems = [];
    if (!Array.isArray(r.suggested_focus)) return ['suggested_focus must be an array'];
    r.suggested_focus.forEach((s, i) => {
      const label = `suggested_focus[${i}].`;
      coerce(s, 'task_index', { numeric: true });
      if (!Number.isInteger(s.task_index) || s.task_index < 1 || s.task_index > taskCount) {
        problems.push(`${label}task_index must be an integer 1-${taskCount}`);
      }
      checkEnum(s, 'confidence', CONFIDENCE, problems, { nullable: false, label });
    });
    return problems;
  };
}

export function validateFindDuplicates(r) {
  const problems = [];
  if (!Array.isArray(r.duplicate_groups)) return ['duplicate_groups must be an array'];
  r.duplicate_groups.forEach((g, i) => {
    const label = `duplicate_groups[${i}].`;
    if (!Array.isArray(g.tasks) || g.tasks.length < 2) {
      problems.push(`${label}tasks must be an array of at least 2 tasks`);
      return;
    }
    g.tasks.forEach(t => coerce(t, 'id', { numeric: true }));
    const keeps = g.tasks.filter(t => t.keep === true).length;
    if (keeps !== 1) problems.push(`${label}tasks must have exactly one task with keep=true (found ${keeps})`);
  });
  return problems;
}

export function validateWeeklyReview(r) {
  const problems = [];
  for (const arr of ['stale_items', 'projects_needing_attention', 'waiting_for_followups', 'recommendations']) {
    if (r[arr] != null && !Array.isArray(r[arr])) problems.push(`${arr} must be an array`);
  }
  (Array.isArray(r.stale_items) ? r.stale_items : []).forEach((s, i) => {
    checkEnum(s, 'suggestion', ['delete', 'move_to_someday', 'follow_up', 'keep'], problems, { nullable: false, label: `stale_items[${i}].` });
    coerce(s, 'id', { numeric: true });
  });
  coerce(r, 'system_health_score', { numeric: true });
  if (r.system_health_score != null && (typeof r.system_health_score !== 'number' || r.system_health_score < 1 || r.system_health_score > 10)) {
    problems.push('system_health_score must be a number from 1 to 10');
  }
  return problems;
}

export function validateAnalyzeTask(r) {
  const problems = [];
  checkEnum(r, 'recommended_list', LISTS, problems, { nullable: false });
  checkEnum(r, 'energy_level', ENERGY, problems);
  coerce(r, 'suggested_context');
  coerce(r, 'time_estimate_minutes', { numeric: true });
  return problems;
}

// Schema-shape validation only. Whether blocks actually fit the day's free
// windows is enforced deterministically AFTER the model responds (packPlan in
// scheduling.js) — a repair round-trip is reserved for things a model can fix
// by re-emitting (bad indexes, malformed times), not for slot arithmetic.
export function validatePlanDay(taskCount) {
  return (r) => {
    const problems = [];
    if (!Array.isArray(r.plan)) return ['plan must be an array'];
    if (r.deferred != null && !Array.isArray(r.deferred)) problems.push('deferred must be an array or omitted');
    r.plan.forEach((b, i) => {
      const label = `plan[${i}].`;
      coerce(b, 'task_index', { numeric: true });
      if (!Number.isInteger(b.task_index) || b.task_index < 1 || b.task_index > taskCount) {
        problems.push(`${label}task_index must be an integer 1-${taskCount}`);
      }
      coerce(b, 'start');
      if (b.start == null || !TIME_RE.test(b.start)) problems.push(`${label}start is "${b.start}" but must be HH:MM 24-hour`);
      coerce(b, 'duration_mins', { numeric: true });
      // Min 5, not 15: tasks legitimately carry 10-minute estimates and the
      // prompt tells the model to use them — a validator floor above real
      // estimates makes the repair loop unwinnable (seen live 2026-07-06).
      if (!Number.isInteger(b.duration_mins) || b.duration_mins < 5 || b.duration_mins > 480) {
        problems.push(`${label}duration_mins must be an integer 5-480`);
      }
    });
    (Array.isArray(r.deferred) ? r.deferred : []).forEach((d, i) => {
      const label = `deferred[${i}].`;
      coerce(d, 'task_index', { numeric: true });
      if (!Number.isInteger(d.task_index) || d.task_index < 1 || d.task_index > taskCount) {
        problems.push(`${label}task_index must be an integer 1-${taskCount}`);
      }
      checkDate(d, 'move_to', problems, label);
    });
    const planIdx = r.plan.map(b => b.task_index);
    if (new Set(planIdx).size !== planIdx.length) problems.push('plan contains the same task_index twice');
    return problems;
  };
}

export function validateProjectBreakdown(r) {
  const problems = [];
  if (!Array.isArray(r.next_actions)) return ['next_actions must be an array'];
  r.next_actions.forEach((a, i) => {
    const label = `next_actions[${i}].`;
    if (typeof a.title !== 'string' || !a.title.trim()) problems.push(`${label}title must be a non-empty string`);
    checkEnum(a, 'energy_level', ENERGY, problems, { label });
    coerce(a, 'context');
    coerce(a, 'time_estimate_minutes', { numeric: true });
    coerce(a, 'order', { numeric: true });
  });
  return problems;
}
