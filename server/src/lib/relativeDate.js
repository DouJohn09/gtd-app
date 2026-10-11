// Deterministic resolution of the relative dates people type most ("tomorrow",
// "Friday", "next Monday"). LLMs are unreliable at weekday arithmetic, so smart
// capture overrides the model's due_date whenever the text names exactly one of
// these. Anything ambiguous or richer ("every Friday", "Oct 20", "start Monday")
// is left to the model.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_RE = new RegExp(`\\b(next\\s+|this\\s+)?(${WEEKDAYS.join('|')})\\b`, 'gi');
const SKIP_RE = /\b(every|each|start|starting|from|after|until|till|between)\b/i;
const EXPLICIT_DATE_RE = /\d{1,2}[./-]\d{1,2}|\b\d{4}-\d{2}-\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// "Friday" = nearest upcoming Friday, today included.
// "next Friday" = Friday of next week (weeks start Monday).
export function resolveWeekday(today, name, isNext) {
  const target = WEEKDAYS.indexOf(name.toLowerCase());
  if (!isNext) return addDays(today, (target - weekdayOf(today) + 7) % 7);
  const mondayOffset = (weekdayOf(today) + 6) % 7;
  const nextMonday = addDays(today, 7 - mondayOffset);
  return addDays(nextMonday, (target + 6) % 7);
}

export function resolveRelativeDate(text, today) {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return null;
  if (SKIP_RE.test(text.replace(/\bday after tomorrow\b/gi, '')) || EXPLICIT_DATE_RE.test(text)) return null;

  const found = new Set();
  if (/\bday after tomorrow\b/i.test(text)) found.add(addDays(today, 2));
  else if (/\btomorrow\b/i.test(text)) found.add(addDays(today, 1));
  if (/\b(today|tonight)\b/i.test(text)) found.add(today);
  for (const m of text.matchAll(WEEKDAY_RE)) {
    found.add(resolveWeekday(today, m[2], /^next/i.test(m[1] || '')));
  }
  return found.size === 1 ? [...found][0] : null;
}

// Prompt helper: the next 14 days spelled out, so the model looks dates up
// instead of computing them.
export function upcomingDaysTable(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return '';
  return Array.from({ length: 14 }, (_, i) => {
    const iso = addDays(today, i);
    const name = WEEKDAYS[weekdayOf(iso)];
    return `${name[0].toUpperCase()}${name.slice(1)} ${iso}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`;
  }).join(', ');
}
