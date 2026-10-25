// Where a habit sits in a day. A habit with a fixed time takes that slot; one
// with a part of the day takes the first gap of its length in that window,
// after meetings and time-blocked tasks. Planning treats these blocks as busy,
// and the calendar draws them, both from this one function, so they agree.
import { pool } from '../db/pool.js';
import { isDueOn } from '../routes/habits.js';
import { timeToMinutes } from './scheduling.js';

export const DAY_PARTS = {
  morning: [7 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 22 * 60],
};
const DEFAULT_MINS = 30;
const STEP = 15;

const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0];

// Active build habits that have a time or a part of the day, plus each one's
// log status per date in [start, end]. Habits without timing stay out of
// planning entirely, as before.
export async function timedHabits(userId, start, end = start) {
  const [{ rows: habits }, { rows: logs }] = await Promise.all([
    pool.query(
      `SELECT id, name, color, frequency, target_days, created_at, type, time_of_day, preferred_time, duration
       FROM habits
       WHERE user_id = $1 AND active = true AND type = 'build'
         AND (preferred_time IS NOT NULL OR time_of_day IS NOT NULL)
       ORDER BY preferred_time NULLS LAST, name`,
      [userId]
    ),
    pool.query(
      `SELECT habit_id, completed_date, status FROM habit_logs
       WHERE user_id = $1 AND completed_date BETWEEN $2::date AND $3::date`,
      [userId, start, end]
    ),
  ]);
  const status = new Map(logs.map(l => [`${l.habit_id}:${String(l.completed_date).slice(0, 10)}`, l.status]));
  return { habits, statusOf: (habitId, date) => status.get(`${habitId}:${date}`) || null };
}

// busy: [[start, end], …] minutes-of-day from meetings and timed tasks.
// Returns one block per habit due that day: { habitId, name, color, start,
// end, fixed, status }. start is null when a part-of-day habit found no room.
// Skipped days (rest day, vacation) get no block; weekly "N times a week"
// habits have no set day, so they never reserve time.
export function placeHabits({ habits, statusOf }, dateStr, busy) {
  const taken = busy.map(r => [...r]);
  const blocks = [];
  const due = habits.filter(h => h.frequency !== 'weekly' && isDueOn(h, dateStr) && statusOf(h.id, dateStr) !== 'skipped');
  // Fixed times first, so a part-of-day habit doesn't grab a slot a fixed one owns.
  for (const h of due.filter(h => h.preferred_time)) {
    const start = timeToMinutes(h.preferred_time);
    const block = [start, start + (h.duration || DEFAULT_MINS)];
    taken.push(block);
    blocks.push({ habit: h, start: block[0], end: block[1], fixed: true });
  }
  for (const h of due.filter(h => !h.preferred_time && DAY_PARTS[h.time_of_day])) {
    const [from, to] = DAY_PARTS[h.time_of_day];
    const len = h.duration || DEFAULT_MINS;
    let slot = null;
    for (let s = from; s + len <= to; s += STEP) {
      if (!taken.some(r => overlaps([s, s + len], r))) { slot = [s, s + len]; break; }
    }
    if (slot) taken.push(slot);
    blocks.push({ habit: h, start: slot?.[0] ?? null, end: slot?.[1] ?? null, fixed: false });
  }
  return blocks
    .map(b => ({
      habitId: b.habit.id,
      name: b.habit.name,
      color: b.habit.color,
      timeOfDay: b.habit.time_of_day,
      duration: b.habit.duration || DEFAULT_MINS,
      start: b.start,
      end: b.end,
      fixed: b.fixed,
      status: statusOf(b.habit.id, dateStr) || 'none',
    }))
    .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
}
