// Lightweight output validation for AI JSON responses. Each validator first
// COERCES common LLM slop in place (string "null" → null, numeric strings →
// numbers), then returns an array of problem strings. A non-empty array
// triggers one "repair" round-trip in complete() before falling back to the
// next model — so validators drop bad list items and clear bad optional
// fields in place, and only report what leaves the answer unusable (wrong
// top-level shape, a required field missing, every item unusable).

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

// Coerce LLM boolean slop ("false"/"0"/1) to a real boolean in place, so a
// downstream `if (obj.field)` can't be fooled by the truthy string "false".
function coerceBool(obj, field) {
  if (!(field in obj)) return;
  const v = obj[field];
  if (typeof v === 'boolean') return;
  if (v === true || v === 'true' || v === 1 || v === '1') obj[field] = true;
  else obj[field] = false; // "false", "0", 0, "", "null", null, undefined, anything else
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

// ---- Salvage helpers. An optional field the model got wrong is cleared (or
// clamped), not reported: losing an energy guess costs nothing, while a
// rejected response costs a repair call, then a fallback call, then an error
// in front of the user. Only a missing REQUIRED field is worth reporting, and
// for list responses even that just drops the one item (see salvageItems).

function softEnum(obj, field, allowed, fallback = null) {
  coerce(obj, field);
  if (obj[field] != null && !allowed.includes(obj[field])) obj[field] = fallback;
}

function softPriority(obj) {
  coerce(obj, 'priority', { numeric: true });
  const v = obj.priority;
  if (v == null) return;
  obj.priority = Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : null;
}

function softDate(obj, field) {
  coerce(obj, field);
  if (obj[field] != null && !(typeof obj[field] === 'string' && DATE_RE.test(obj[field]))) obj[field] = null;
}

function softTime(obj, field) {
  coerce(obj, field);
  if (obj[field] != null && !(typeof obj[field] === 'string' && TIME_RE.test(obj[field]))) obj[field] = null;
}

function softConfidence(obj, keys) {
  if (obj.confidence == null) return;
  if (typeof obj.confidence !== 'object' || Array.isArray(obj.confidence)) { obj.confidence = null; return; }
  for (const k of keys) {
    if (obj.confidence[k] != null && !CONFIDENCE.includes(obj.confidence[k])) delete obj.confidence[k];
  }
}

function inRangeInt(v, max) {
  return Number.isInteger(v) && v >= 1 && v <= max;
}

// Filters r[field] in place to the items `keep` accepts (keep may also fix an
// item up). Returns problems only when the model sent items and NONE survived —
// then there's nothing to use and a repair is worth one call.
function salvageItems(r, field, keep) {
  if (!Array.isArray(r[field])) return [`${field} must be an array`];
  const before = r[field].length;
  const reasons = [];
  r[field] = r[field].filter((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { reasons.push(`${field}[${i}] is not an object`); return false; }
    const why = keep(item);
    if (why) { reasons.push(`${field}[${i}].${why}`); return false; }
    return true;
  });
  if (reasons.length) console.warn(`[aiSchema] dropped ${reasons.length}/${before} ${field}: ${reasons.slice(0, 3).join('; ')}`);
  return before > 0 && r[field].length === 0 ? reasons.slice(0, 5) : [];
}

export function validateSmartCapture(r) {
  const problems = [];
  if (typeof r.title !== 'string' || !r.title.trim()) problems.push('title must be a non-empty string');
  checkEnum(r, 'list', LISTS, problems, { nullable: false });
  softEnum(r, 'list_confidence', CONFIDENCE, 'low');
  if (r.list_confidence == null) r.list_confidence = 'low';
  softEnum(r, 'energy_level', ENERGY);
  softPriority(r);
  softDate(r, 'due_date');
  softDate(r, 'start_date');
  softTime(r, 'scheduled_time');
  softEnum(r, 'recurrence_rule', RECURRENCE);
  coerce(r, 'time_estimate_minutes', { numeric: true });
  coerce(r, 'duration', { numeric: true });
  coerce(r, 'recurrence_interval', { numeric: true });
  coerce(r, 'waiting_for_person');
  coerce(r, 'project_name');
  coerce(r, 'context');
  coerce(r, 'possible_duplicate_of');
  coerceBool(r, 'find_free_slot');
  coerceBool(r, 'is_daily_focus');
  return problems;
}

export function validateProcessInbox(taskCount) {
  return (r) => {
    const seen = new Set();
    return salvageItems(r, 'processed_items', (item) => {
      coerce(item, 'original_index', { numeric: true });
      if (!inRangeInt(item.original_index, taskCount)) return `original_index must be an integer 1-${taskCount}`;
      if (seen.has(item.original_index)) return 'original_index repeated';
      coerce(item, 'recommended_list');
      // An item the model can't place just stays in the inbox — safe to drop.
      if (!LISTS.includes(item.recommended_list)) return `recommended_list must be one of: ${LISTS.join('|')}`;
      seen.add(item.original_index);
      softEnum(item, 'energy_level', ENERGY);
      softPriority(item);
      softDate(item, 'due_date');
      coerce(item, 'context');
      coerce(item, 'project_name');
      coerce(item, 'waiting_for_person');
      coerce(item, 'time_estimate_minutes', { numeric: true });
      softConfidence(item, ['list', 'context', 'priority', 'due_date', 'project']);
      return null;
    });
  };
}

export function validateImportNotes(r) {
  return salvageItems(r, 'items', (item) => {
    if (typeof item.title !== 'string' || !item.title.trim()) return 'title must be a non-empty string';
    // A note the model couldn't classify still gets imported — to the inbox.
    softEnum(item, 'recommended_list', LISTS, 'inbox');
    if (item.recommended_list == null) item.recommended_list = 'inbox';
    softEnum(item, 'energy_level', ENERGY);
    softPriority(item);
    softDate(item, 'due_date');
    coerce(item, 'context');
    coerce(item, 'project_name');
    coerce(item, 'waiting_for_person');
    coerce(item, 'time_estimate', { numeric: true });
    softConfidence(item, ['list', 'context', 'project', 'due_date', 'energy', 'time', 'waiting_for', 'daily_focus']);
    return null;
  });
}

export function validateDailyPriorities(taskCount) {
  return (r) => {
    const seen = new Set();
    return salvageItems(r, 'suggested_focus', (s) => {
      coerce(s, 'task_index', { numeric: true });
      if (!inRangeInt(s.task_index, taskCount)) return `task_index must be an integer 1-${taskCount}`;
      if (seen.has(s.task_index)) return 'task_index repeated';
      seen.add(s.task_index);
      softEnum(s, 'confidence', CONFIDENCE, 'medium');
      if (s.confidence == null) s.confidence = 'medium';
      return null;
    });
  };
}

// The route re-checks ownership and keep counts too; groups that don't make
// sense are dropped here so they never cost a repair.
export function validateFindDuplicates(r) {
  return salvageItems(r, 'duplicate_groups', (g) => {
    if (!Array.isArray(g.tasks) || g.tasks.length < 2) return 'tasks must be an array of at least 2 tasks';
    g.tasks = g.tasks.filter(t => t && typeof t === 'object');
    g.tasks.forEach(t => { coerce(t, 'id', { numeric: true }); coerceBool(t, 'keep'); });
    const keeps = g.tasks.filter(t => t.keep === true).length;
    if (g.tasks.length < 2 || keeps !== 1) return `tasks must have exactly one keep=true (found ${keeps})`;
    return null;
  });
}

export function validateWeeklyReview(r) {
  const problems = [];
  for (const arr of ['stale_items', 'projects_needing_attention', 'waiting_for_followups', 'recommendations']) {
    if (r[arr] == null) continue;
    if (!Array.isArray(r[arr])) { r[arr] = []; continue; }
  }
  if (Array.isArray(r.stale_items)) {
    salvageItems(r, 'stale_items', (s) => {
      coerce(s, 'id', { numeric: true });
      coerce(s, 'suggestion');
      if (!['delete', 'move_to_someday', 'follow_up', 'keep'].includes(s.suggestion)) return 'suggestion must be delete|move_to_someday|follow_up|keep';
      return null;
    });
  }
  coerce(r, 'system_health_score', { numeric: true });
  if (r.system_health_score != null) {
    r.system_health_score = Number.isFinite(r.system_health_score)
      ? Math.min(10, Math.max(1, Math.round(r.system_health_score)))
      : null;
  }
  return problems;
}

export function validateAnalyzeTask(r) {
  const problems = [];
  checkEnum(r, 'recommended_list', LISTS, problems, { nullable: false });
  softEnum(r, 'energy_level', ENERGY);
  coerce(r, 'suggested_context');
  coerce(r, 'time_estimate_minutes', { numeric: true });
  return problems;
}

// Schema-shape validation only. Whether blocks actually fit the day's free
// windows is enforced deterministically AFTER the model responds (packPlan in
// scheduling.js), and packPlan also places a block with no usable start in the
// earliest slot — so a bad start is cleared, not repaired.
export function validatePlanDay(taskCount) {
  return (r) => {
    if (r.deferred != null && !Array.isArray(r.deferred)) r.deferred = [];
    const seen = new Set();
    const problems = salvageItems(r, 'plan', (b) => {
      coerce(b, 'task_index', { numeric: true });
      if (!inRangeInt(b.task_index, taskCount)) return `task_index must be an integer 1-${taskCount}`;
      if (seen.has(b.task_index)) return 'task_index repeated';
      seen.add(b.task_index);
      softTime(b, 'start');
      coerce(b, 'duration_mins', { numeric: true });
      // Clamp, don't reject. The prompt tells the model to use the task's own
      // estimate, so a large estimate (a 10-hour task → 600) would deadlock the
      // repair loop against a ceiling it was instructed to exceed — same class
      // as the min-floor deadlock seen live 2026-07-06.
      b.duration_mins = Number.isFinite(Number(b.duration_mins))
        ? Math.min(480, Math.max(5, Math.round(Number(b.duration_mins))))
        : 30;
      return null;
    });
    if (Array.isArray(r.deferred)) {
      salvageItems(r, 'deferred', (d) => {
        coerce(d, 'task_index', { numeric: true });
        if (!inRangeInt(d.task_index, taskCount) || seen.has(d.task_index)) return 'task_index invalid or already planned';
        softDate(d, 'move_to'); // null → the caller moves it to tomorrow
        return null;
      });
    }
    return problems;
  };
}

// Plan-week: every task index at most once across placements+unplaced; dates
// must be one of the window's days (the route re-checks start/due bounds).
export function validatePlanWeek(taskCount, allowedDates) {
  const allowed = new Set(allowedDates);
  return (r) => {
    const problems = [];
    if (!Array.isArray(r.placements)) return ['placements must be an array'];
    if (r.unplaced != null && !Array.isArray(r.unplaced)) problems.push('unplaced must be an array or omitted');
    // Drop, don't reject. With 20+ candidates the model reliably invents an
    // index or two (seen live 2026-09-21: gpt-4.1-mini failed the repair loop
    // twice on "task_index must be 1-22"). The route's reconcile pass already
    // handles missing/duplicate tasks and out-of-window dates, so a bad entry
    // costs nothing; a rejected response costs the whole call.
    const seen = new Set();
    const keepPlacement = (pl) => {
      coerce(pl, 'task_index', { numeric: true });
      if (!Number.isInteger(pl.task_index) || pl.task_index < 1 || pl.task_index > taskCount) return false;
      if (seen.has(pl.task_index)) return false;
      seen.add(pl.task_index);
      coerce(pl, 'date');
      if (!pl.date || !allowed.has(pl.date)) pl.date = null; // reconcile picks a day within bounds
      coerce(pl, 'estimate_mins', { numeric: true });
      pl.estimate_mins = Number.isFinite(Number(pl.estimate_mins)) && pl.estimate_mins > 0 ? Math.min(480, Math.max(5, Math.round(Number(pl.estimate_mins)))) : null;
      return true;
    };
    r.placements = r.placements.filter(pl => pl && typeof pl === 'object' && keepPlacement(pl));
    r.unplaced = (Array.isArray(r.unplaced) ? r.unplaced : []).filter(u => {
      if (!u || typeof u !== 'object') return false;
      coerce(u, 'task_index', { numeric: true });
      coerce(u, 'estimate_mins', { numeric: true });
      u.estimate_mins = Number.isFinite(Number(u.estimate_mins)) && u.estimate_mins > 0 ? Math.min(480, Math.max(5, Math.round(Number(u.estimate_mins)))) : null;
      return Number.isInteger(u.task_index) && u.task_index >= 1 && u.task_index <= taskCount && !seen.has(u.task_index);
    });
    return problems;
  };
}

export function validateProjectBreakdown(r) {
  return salvageItems(r, 'next_actions', (a) => {
    if (typeof a.title !== 'string' || !a.title.trim()) return 'title must be a non-empty string';
    softEnum(a, 'energy_level', ENERGY);
    coerce(a, 'context');
    coerce(a, 'time_estimate_minutes', { numeric: true });
    coerce(a, 'order', { numeric: true });
    return null;
  });
}
