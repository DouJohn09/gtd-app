import { TaskModel } from '../db/models.js';
import { getCalendarEvents } from './googleCalendar.js';

const SLOT_STEP_MINS = 15;

function workingHoursFor(dateStr) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  const isWeekend = day === 0 || day === 6;
  return isWeekend
    ? { start: 10 * 60, end: 16 * 60 }
    : { start: 9 * 60, end: 18 * 60 };
}

function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isoToMinutesOfDay(iso, dateStr) {
  if (!iso) return null;
  const d = new Date(iso);
  const dayStart = new Date(dateStr + 'T00:00:00');
  const diffMins = Math.round((d.getTime() - dayStart.getTime()) / 60000);
  return diffMins;
}

function collectBusyRanges(userId, dateStr, gcalEvents, ownTasks) {
  const ranges = [];

  // Own time blocks
  for (const t of ownTasks) {
    if (t.due_date !== dateStr) continue;
    const start = timeToMinutes(t.scheduled_time);
    if (start === null) continue;
    const end = start + (t.duration || 60);
    ranges.push([start, end]);
  }

  // Google events (skip all-day)
  for (const e of gcalEvents) {
    if (e.due_date !== dateStr) continue;
    if (e.all_day) continue;
    const start = isoToMinutesOfDay(e.start_time, dateStr);
    const end = isoToMinutesOfDay(e.end_time, dateStr);
    if (start === null || end === null) continue;
    ranges.push([Math.max(0, start), Math.min(24 * 60, end)]);
  }

  // Merge overlapping
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push([...r]);
    }
  }
  return merged;
}

export async function findFreeSlot(userId, dateStr, durationMins) {
  const { start: workStart, end: workEnd } = workingHoursFor(dateStr);

  const ownTasks = TaskModel.getByDateRange(dateStr, dateStr, userId);
  let gcalEvents = [];
  try {
    gcalEvents = await getCalendarEvents(userId, dateStr, dateStr);
  } catch (err) {
    console.error('findFreeSlot: GCal fetch failed:', err.message);
  }

  const busy = collectBusyRanges(userId, dateStr, gcalEvents, ownTasks);

  for (let candidate = workStart; candidate + durationMins <= workEnd; candidate += SLOT_STEP_MINS) {
    const candidateEnd = candidate + durationMins;
    const conflicts = busy.some(([bStart, bEnd]) => candidate < bEnd && candidateEnd > bStart);
    if (!conflicts) {
      return minutesToTime(candidate);
    }
  }

  return null;
}
