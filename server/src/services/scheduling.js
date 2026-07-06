import { TaskModel } from '../db/models.js';
import { getCalendarEvents } from './googleCalendar.js';

const SLOT_STEP_MINS = 15;

export function workingHoursFor(dateStr) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  const isWeekend = day === 0 || day === 6;
  return isWeekend
    ? { start: 10 * 60, end: 16 * 60 }
    : { start: 9 * 60, end: 18 * 60 };
}

export function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isoToMinutesOfDay(iso, dateStr) {
  if (!iso) return null;
  const d = new Date(iso);
  const dayStart = new Date(dateStr + 'T00:00:00');
  const diffMins = Math.round((d.getTime() - dayStart.getTime()) / 60000);
  return diffMins;
}

export function collectBusyRanges(dateStr, gcalEvents, ownTasks) {
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

// Fetches the user's day (own scheduled tasks + Google events, soft-failing
// on GCal errors) and returns the merged busy ranges plus working hours.
async function busyRangesFor(userId, dateStr) {
  const ownTasks = await TaskModel.getByDateRange(dateStr, dateStr, userId);
  let gcalEvents = [];
  try {
    gcalEvents = await getCalendarEvents(userId, dateStr, dateStr);
  } catch (err) {
    console.error('busyRangesFor: GCal fetch failed:', err.message);
  }
  const { start: workStart, end: workEnd } = workingHoursFor(dateStr);
  const busy = collectBusyRanges(dateStr, gcalEvents, ownTasks);
  return { busy, workStart, workEnd, gcalEvents, ownTasks };
}

// The gaps inside working hours once busy ranges are subtracted — the raw
// material for both slot-finding and day planning. Ranges are minutes-of-day.
export function freeRangesFrom(busy, workStart, workEnd) {
  const free = [];
  let cursor = workStart;
  for (const [bStart, bEnd] of busy) {
    if (bEnd <= workStart || bStart >= workEnd) continue;
    if (bStart > cursor) free.push({ start: cursor, end: Math.min(bStart, workEnd) });
    cursor = Math.max(cursor, bEnd);
    if (cursor >= workEnd) break;
  }
  if (cursor < workEnd) free.push({ start: cursor, end: workEnd });
  return free.filter(r => r.end - r.start >= SLOT_STEP_MINS);
}

// Full free/busy picture for one user-day. `free`/`busy` in minutes-of-day;
// `events` is the fetched context (own scheduled tasks + Google events) so
// callers that also need the raw day (the planner) don't fetch twice.
export async function freeRangesFor(userId, dateStr) {
  const { busy, workStart, workEnd, gcalEvents, ownTasks } = await busyRangesFor(userId, dateStr);
  const free = freeRangesFrom(busy, workStart, workEnd);
  const totalFreeMins = free.reduce((sum, r) => sum + (r.end - r.start), 0);
  return { free, busy, workStart, workEnd, totalFreeMins, gcalEvents, ownTasks };
}

// Deterministic backstop for the AI day-planner: takes the model's proposed
// blocks ({ start: minutes-of-day, duration, ...meta }) and the day's free
// ranges, and returns { placed, overflow }. A block keeps its proposed start
// when that slot is genuinely free (given earlier placements); otherwise it
// is moved to the earliest 15-min-aligned slot that fits; if nothing fits it
// overflows (the caller defers it). The plan the user sees is therefore
// guaranteed conflict-free no matter what the model emitted.
export function packPlan(blocks, freeRanges) {
  // Remaining capacity as a mutable list of {start,end} ranges.
  let remaining = freeRanges.map(r => ({ ...r }));
  const placed = [];
  const overflow = [];

  const carve = (rangeIdx, start, end) => {
    const r = remaining[rangeIdx];
    const pieces = [];
    if (start - r.start >= SLOT_STEP_MINS) pieces.push({ start: r.start, end: start });
    if (r.end - end >= SLOT_STEP_MINS) pieces.push({ start: end, end: r.end });
    remaining.splice(rangeIdx, 1, ...pieces);
  };

  const tryPlace = (block) => {
    const d = block.duration;
    // 1. Honor the proposed start if it fits inside one remaining range.
    if (block.start != null) {
      const idx = remaining.findIndex(r => r.start <= block.start && block.start + d <= r.end);
      if (idx !== -1) {
        carve(idx, block.start, block.start + d);
        return block.start;
      }
    }
    // 2. Earliest aligned slot that fits.
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      const aligned = Math.ceil(r.start / SLOT_STEP_MINS) * SLOT_STEP_MINS;
      if (aligned + d <= r.end) {
        carve(i, aligned, aligned + d);
        return aligned;
      }
    }
    return null;
  };

  // Place in proposed-start order so earlier blocks win their slots.
  const ordered = [...blocks].sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
  for (const block of ordered) {
    const start = tryPlace(block);
    if (start === null) overflow.push(block);
    else placed.push({ ...block, start, moved: start !== block.start });
  }
  placed.sort((a, b) => a.start - b.start);
  return { placed, overflow };
}

export async function findFreeSlot(userId, dateStr, durationMins) {
  const { busy, workStart, workEnd } = await busyRangesFor(userId, dateStr);

  for (let candidate = workStart; candidate + durationMins <= workEnd; candidate += SLOT_STEP_MINS) {
    const candidateEnd = candidate + durationMins;
    const conflicts = busy.some(([bStart, bEnd]) => candidate < bEnd && candidateEnd > bStart);
    if (!conflicts) {
      return minutesToTime(candidate);
    }
  }

  return null;
}
