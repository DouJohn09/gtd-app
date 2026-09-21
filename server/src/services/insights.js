// Insights: what the user's own history says about when they get things done,
// when their habits stick, and how their planned days compare with reality.
//
// Everything here is deterministic — SQL plus a few rule-based sentences. No AI
// call, no per-view cost, nothing that can hallucinate. Timestamps are bucketed
// in the user's timezone (the validated req.clientTimezone), because "9am" only
// means something in local time.
//
// Thin data lies, so every card carries `enough` and hides its sentence below a
// minimum sample. The Plan-vs-reality profile is also what the day planner
// reads to calibrate itself (see planDay's "what we know about you").

import { pool } from '../db/pool.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_COMPLETIONS = 20;
const MIN_HABIT_LOGS = 10;
export const MIN_PLANNED_DAYS_SOFT = 5;   // profile mentioned to the planner, no cap
export const MIN_PLANNED_DAYS_FIRM = 10;  // block cap enforced

// --- time helpers ------------------------------------------------------------

function partsFormatter(tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'UTC', hour: 'numeric', hour12: false, weekday: 'short',
  });
}

// Returns { hour: 0-23, weekday: 0-6 (Sun=0) } for a Date in the user's tz.
function localParts(fmt, date) {
  const parts = fmt.formatToParts(date);
  const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(hourStr) % 24; // some engines print "24" for midnight
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return { hour, weekday: weekday < 0 ? 0 : weekday };
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

const pad = (n) => String(n).padStart(2, '0');
export function hourLabel(h) { return `${pad(h)}:00`; }

// Best contiguous window of `width` hours in a 24-slot histogram.
function peakWindow(hist, width = 2) {
  let best = { start: 0, sum: -1 };
  for (let s = 0; s <= 24 - width; s++) {
    let sum = 0;
    for (let i = 0; i < width; i++) sum += hist[s + i];
    if (sum > best.sum) best = { start: s, sum };
  }
  return { start: best.start, end: best.start + width, count: best.sum };
}

function share(part, total) { return total ? part / total : 0; }

// --- 1. Productive hours + 2. Your week ---------------------------------------

export async function completionPatterns(userId, tz, weeks = 8) {
  const { rows } = await pool.query(
    `SELECT completed_at FROM tasks
      WHERE user_id = $1 AND list = 'completed' AND completed_at IS NOT NULL AND completed_at >= $2`,
    [userId, daysAgo(weeks * 7)]
  );
  const fmt = partsFormatter(tz);
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const byWeekdayHour = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows) {
    const { hour, weekday } = localParts(fmt, new Date(r.completed_at));
    byHour[hour]++; byWeekday[weekday]++; byWeekdayHour[weekday][hour]++;
  }
  const total = rows.length;
  const enough = total >= MIN_COMPLETIONS;

  const peak = peakWindow(byHour, 2);
  const afterHour = 16;
  const lateShare = share(byHour.slice(afterHour).reduce((a, b) => a + b, 0), total);
  const peakShare = share(peak.count, total);

  let hoursSentence = null;
  if (enough) {
    // A flat spread (peak 2h holds < 20%) gets a hedge instead of a false pattern.
    if (peakShare < 0.2) {
      hoursSentence = `Your completions are spread through the day — no single window stands out yet.`;
    } else {
      hoursSentence = `Most of your tasks get finished between ${hourLabel(peak.start)} and ${hourLabel(peak.end)}.`;
      if (lateShare < 0.1) hoursSentence += ` Almost nothing after ${hourLabel(afterHour)}.`;
      else if (lateShare > 0.35) hoursSentence += ` You also finish a lot late in the day.`;
    }
  }

  const strongest = byWeekday.indexOf(Math.max(...byWeekday));
  const weakest = byWeekday.indexOf(Math.min(...byWeekday));
  let weekSentence = null;
  if (enough && Math.max(...byWeekday) > 0) {
    const spread = share(byWeekday[strongest] - byWeekday[weakest], total);
    weekSentence = spread < 0.08
      ? `Your week is fairly even — no day is doing all the work.`
      : `${WEEKDAYS[strongest]} is your strongest day; ${WEEKDAYS[weakest]} is your quietest.`;
  }

  return {
    total, weeks, enough, minimum: MIN_COMPLETIONS,
    byHour, byWeekday, byWeekdayHour,
    peak: enough ? { start: peak.start, end: peak.end, share: peakShare } : null,
    hoursSentence, weekSentence,
    strongestDay: enough ? WEEKDAYS[strongest] : null,
    weakestDay: enough ? WEEKDAYS[weakest] : null,
  };
}

// --- 3. Habits ----------------------------------------------------------------

export async function habitPatterns(userId, tz, weeks = 8) {
  const since = daysAgo(weeks * 7);
  const { rows: habits } = await pool.query(
    `SELECT id, name, frequency, type FROM habits WHERE user_id = $1 AND active = true ORDER BY name`,
    [userId]
  );
  if (habits.length === 0) return { habits: [], enough: false, minimum: MIN_HABIT_LOGS };

  const { rows: logs } = await pool.query(
    `SELECT habit_id, completed_date, created_at, status FROM habit_logs
      WHERE user_id = $1 AND completed_date >= $2::date`,
    [userId, since.toISOString().slice(0, 10)]
  );
  const fmt = partsFormatter(tz);
  const windowDays = weeks * 7;

  const out = habits.map(h => {
    const mine = logs.filter(l => l.habit_id === h.id);
    const done = mine.filter(l => l.status === 'done');
    const skipped = mine.length - done.length;
    const byHour = new Array(24).fill(0);
    const byWeekday = new Array(7).fill(0);
    for (const l of done) {
      const { hour, weekday } = localParts(fmt, new Date(l.created_at));
      byHour[hour]++; byWeekday[weekday]++;
    }
    const enough = done.length >= MIN_HABIT_LOGS;
    const peak = peakWindow(byHour, 2);
    // Consistency: done days over the window, skips excused. Only daily habits
    // have a clean denominator; the rest report counts, not a rate.
    const rate = h.frequency === 'daily' ? Math.min(1, done.length / Math.max(1, windowDays - skipped)) : null;
    const weekendShare = share(byWeekday[0] + byWeekday[6], done.length);

    let sentence = null;
    if (enough) {
      const when = share(peak.count, done.length) >= 0.35
        ? `usually around ${hourLabel(peak.start)}–${hourLabel(peak.end)}`
        : `at no fixed time`;
      const slip = h.frequency === 'daily' && weekendShare < 0.15 ? `; it slips on weekends` : '';
      sentence = `${h.name}: ${when}${slip}.`;
    }
    return {
      id: h.id, name: h.name, frequency: h.frequency, type: h.type,
      done: done.length, skipped, rate, byHour, byWeekday, enough, sentence,
      peak: enough ? { start: peak.start, end: peak.end } : null,
    };
  });

  return { habits: out, enough: out.some(h => h.enough), minimum: MIN_HABIT_LOGS, weeks };
}

// --- 4. Plan vs reality -------------------------------------------------------

// Fact recording. Called by /apply-plan; additive like the route itself: a task
// that gets re-planned the same day closes its old block as 'replanned'.
export async function recordAppliedBlocks(userId, planDate, items) {
  if (!items.length) return;
  const taskIds = items.map(i => i.taskId);
  await pool.query(
    `UPDATE plan_blocks SET outcome = 'replanned', outcome_at = NOW()
      WHERE user_id = $1 AND plan_date = $2 AND outcome IS NULL AND task_id = ANY($3::int[])`,
    [userId, planDate, taskIds]
  );
  const { rows: est } = await pool.query(
    `SELECT id, time_estimate FROM tasks WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, taskIds]
  );
  const estimateOf = new Map(est.map(r => [r.id, r.time_estimate]));
  for (const i of items) {
    await pool.query(
      `INSERT INTO plan_blocks (user_id, task_id, plan_date, start_time, duration, estimate_at_plan)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, i.taskId, planDate, i.start, i.duration || 30, estimateOf.get(i.taskId) ?? null]
    );
  }
}

// Closes the open block for a task. `outcome` is one of the CHECK values.
export async function closeBlock(userId, taskId, outcome) {
  await pool.query(
    `UPDATE plan_blocks SET outcome = $3, outcome_at = NOW()
      WHERE user_id = $1 AND task_id = $2 AND outcome IS NULL`,
    [userId, taskId, outcome]
  );
}

// A completed planned task that gets restored reopens its block, so an
// accidental tick doesn't count as a finished day.
export async function reopenBlock(userId, taskId) {
  await pool.query(
    `UPDATE plan_blocks SET outcome = NULL, outcome_at = NULL
      WHERE user_id = $1 AND task_id = $2 AND outcome = 'done'
        AND plan_date >= (CURRENT_DATE - INTERVAL '2 days')`,
    [userId, taskId]
  );
}

export async function planReality(userId, tz, { maxDays = 28, today } = {}) {
  // Only days that are over can be judged; today's blocks are still in play.
  const { rows } = await pool.query(
    `SELECT plan_date::text AS plan_date, start_time, duration, estimate_at_plan, outcome
       FROM plan_blocks
      WHERE user_id = $1 AND outcome IS DISTINCT FROM 'replanned'
        AND plan_date < COALESCE($2::date, CURRENT_DATE)
        AND plan_date IN (
          SELECT DISTINCT plan_date FROM plan_blocks
           WHERE user_id = $1 AND plan_date < COALESCE($2::date, CURRENT_DATE)
           ORDER BY plan_date DESC LIMIT $3)`,
    [userId, today || null, maxDays]
  );

  const days = new Map();
  const byHour = { planned: new Array(24).fill(0), done: new Array(24).fill(0) };
  let planned = 0, done = 0, moved = 0, released = 0, open = 0;
  for (const r of rows) {
    planned++;
    const d = days.get(r.plan_date) || { planned: 0, done: 0 };
    d.planned++;
    const hour = Number(String(r.start_time).slice(0, 2)) % 24;
    byHour.planned[hour]++;
    if (r.outcome === 'done') { done++; d.done++; byHour.done[hour]++; }
    else if (r.outcome === 'tomorrow' || r.outcome === 'slot') moved++;
    else if (r.outcome === 'release') released++;
    else open++; // never closed: the day ended without a shutdown — counts as not finished
    days.set(r.plan_date, d);
  }
  const dayCount = days.size;
  const avgPlanned = dayCount ? planned / dayCount : 0;
  const avgDone = dayCount ? done / dayCount : 0;
  const completionRate = share(done, planned);

  // Hour buckets with enough planned blocks to say anything.
  const hourRates = byHour.planned.map((p, h) => ({ hour: h, planned: p, done: byHour.done[h], rate: share(byHour.done[h], p) }));
  const rated = hourRates.filter(b => b.planned >= 3);
  const bestHour = rated.length ? rated.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worstHour = rated.length > 1 ? rated.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

  const level = dayCount >= MIN_PLANNED_DAYS_FIRM ? 'firm' : dayCount >= MIN_PLANNED_DAYS_SOFT ? 'soft' : 'none';
  // Cap: what they actually finish, plus a little stretch, never below 2.
  const suggestedBlocks = level === 'none' ? null : Math.max(2, Math.round(avgDone * 1.15));

  let sentence = null;
  if (level !== 'none') {
    sentence = `Over ${dayCount} planned days you finished ${done} of ${planned} blocks (${Math.round(completionRate * 100)}%). ` +
      `You tend to plan ${avgPlanned.toFixed(1)} and finish ${avgDone.toFixed(1)} a day.`;
    if (bestHour && worstHour && bestHour.hour !== worstHour.hour && bestHour.rate - worstHour.rate >= 0.3) {
      sentence += ` Blocks starting around ${hourLabel(bestHour.hour)} get done; ones around ${hourLabel(worstHour.hour)} mostly don't.`;
    }
  }

  return {
    days: dayCount, planned, done, moved, released, open,
    completionRate, avgPlanned, avgDone, suggestedBlocks, level,
    byHour: hourRates, bestHour, worstHour, sentence,
    minimum: MIN_PLANNED_DAYS_SOFT,
  };
}

// The paragraph the planner reads. Empty string below the soft threshold.
export function planningProfileText(reality) {
  if (!reality || reality.level === 'none') return '';
  const lines = [
    `WHAT WE KNOW ABOUT THIS PERSON (from ${reality.days} planned days):`,
    `- They finish about ${Math.round(reality.completionRate * 100)}% of planned blocks: on average ${reality.avgPlanned.toFixed(1)} planned, ${reality.avgDone.toFixed(1)} finished per day.`,
  ];
  if (reality.bestHour) lines.push(`- Blocks starting around ${hourLabel(reality.bestHour.hour)} usually get done.`);
  if (reality.worstHour && reality.worstHour.rate < 0.4) lines.push(`- Blocks starting around ${hourLabel(reality.worstHour.hour)} usually do not; avoid that hour for anything important.`);
  if (reality.moved + reality.released > 0) lines.push(`- ${reality.moved} blocks were pushed to another day and ${reality.released} were dropped. Over-planning is this person's pattern, not under-planning.`);
  lines.push(reality.level === 'firm'
    ? `- HARD LIMIT: plan at most ${reality.suggestedBlocks} blocks today. Put the rest in "deferred" with an honest reason.`
    : `- Lean towards ${reality.suggestedBlocks} blocks or fewer today.`);
  return lines.join('\n');
}

// One calm line shown with the plan, so the person sees the planner adapting.
export function calibrationLine(reality, plannedCount) {
  if (!reality || reality.level === 'none') return null;
  const avg = reality.avgDone.toFixed(1).replace(/\.0$/, '');
  if (reality.level === 'firm' && plannedCount <= reality.suggestedBlocks) {
    return `Planned ${plannedCount} block${plannedCount === 1 ? '' : 's'}: over your last ${reality.days} planned days you finished about ${avg} a day, so today is sized to that.`;
  }
  return `Your last ${reality.days} planned days finished about ${avg} blocks a day on average.`;
}
