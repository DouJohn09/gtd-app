import { Check, Clock, Zap, Tag, FolderOpen, User, ExternalLink, Repeat, CalendarClock } from 'lucide-react';

const ENERGY_TONES = {
  low: 'mint',
  medium: 'amber',
  high: 'rose',
};

function parseNotes(notes) {
  if (!notes) return { text: '', urls: [] };
  const urlRe = /https?:\/\/[^\s]+/gi;
  // Extract every URL — inline or on its own line. Strip trailing sentence
  // punctuation that the greedy match swallows (e.g. "see https://x.com.") so
  // the link isn't broken, and de-dupe.
  const stripTrailing = (u) => u.replace(/[.,;:!?)\]}>'"]+$/, '');
  const urls = [...new Set((notes.match(urlRe) || []).map(stripTrailing))];
  // Remove URLs from the displayed preview (they're surfaced as clickable
  // badges), then tidy the whitespace inline removal leaves behind.
  const text = notes
    .replace(urlRe, '')
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return { text, urls };
}

function hostname(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return 'link'; }
}

function formatScheduledTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

// Render a string with any inline URLs turned into clickable links. Used for the
// title, where a URL may live in the text itself (e.g. "Check https://…"). The
// link stops propagation so clicking it opens the URL instead of the task modal.
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
function linkify(text) {
  if (!text) return text;
  return text.split(URL_SPLIT).map((part, i) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const href = part.replace(/[.,;:!?)\]}>'"]+$/, '');
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-mint-glow underline decoration-mint/40 hover:decoration-mint [overflow-wrap:anywhere]"
      >
        {part}
      </a>
    );
  });
}

export default function TaskCard({ task, onComplete, onEdit, showList = false, queued = false }) {
  const isCompleted = task.list === 'completed';
  const focus = !!task.is_daily_focus && !queued && !isCompleted;
  const energyTone = ENERGY_TONES[task.energy_level];
  const { text: notesText, urls: noteUrls } = parseNotes(task.notes);

  return (
    <div
      className="relative rounded-2xl glass p-4 flex items-start gap-3 transition-all"
      style={
        isCompleted
          ? { opacity: 0.6 }
          : queued
          ? { opacity: 0.5 }
          : focus
          ? { boxShadow: '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 1px 0 rgb(255 255 255 / 0.05), inset 0 0 0 1px rgb(var(--amber) / 0.22), inset 3px 0 0 rgb(var(--amber-glow))' }
          : undefined
      }
    >
      {/* Checkbox */}
      <button
        onClick={() => onComplete?.(task.id)}
        disabled={isCompleted || queued}
        aria-pressed={isCompleted}
        className="fresh-check mt-0.5 w-5 h-5 rounded-full grid place-items-center transition-all flex-shrink-0"
        style={
          isCompleted
            ? {
                background: 'linear-gradient(180deg, rgb(var(--mint) / 0.85), rgb(var(--mint) / 0.65))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 12px rgb(var(--mint) / 0.3)',
              }
            : queued
            ? { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.10)', cursor: 'not-allowed' }
            : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)' }
        }
      >
        {isCompleted && <Check className="w-3 h-3 text-bg" strokeWidth={3} />}
      </button>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div
          onClick={() => onEdit?.(task)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit?.(task); } }}
          className={`block w-full text-left text-[14px] font-medium leading-snug transition-colors hover:text-violet-glow [overflow-wrap:anywhere] cursor-pointer ${isCompleted ? 'line-through text-text-3' : 'text-text-1'}`}
        >
          {linkify(task.title)}
        </div>

        {notesText && (
          <p className="text-[12px] text-text-3 mt-1 line-clamp-2 leading-relaxed [overflow-wrap:anywhere]">{notesText}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {showList && (
            <span className={`gtd-badge list-${task.list}`}>{task.list.replace('_', ' ')}</span>
          )}

          {task.context && (
            <span className="context-badge inline-flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {task.context}
            </span>
          )}

          {task.project_name && (
            <span
              className="gtd-badge inline-flex items-center gap-1"
              style={{ background: 'rgb(var(--violet) / 0.12)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.20)' }}
            >
              <FolderOpen className="w-2.5 h-2.5" />
              {task.project_name}
            </span>
          )}

          {noteUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="gtd-badge relative z-10 inline-flex items-center gap-1 no-underline cursor-pointer transition-all hover:brightness-125 hover:scale-105"
              style={{ background: 'rgb(var(--mint) / 0.10)', color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.20)' }}
            >
              <ExternalLink className="w-2.5 h-2.5" />
              {hostname(url)}
            </a>
          ))}

          {task.energy_level && (
            <span
              className="font-mono text-[10.5px] uppercase tracking-wider inline-flex items-center gap-1"
              style={{ color: `rgb(var(--${energyTone}-glow))` }}
            >
              <Zap className="w-2.5 h-2.5" />
              {task.energy_level}
            </span>
          )}

          {task.time_estimate && (
            <span className="font-mono text-[10.5px] text-text-3 inline-flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {task.time_estimate}m
            </span>
          )}

          {task.waiting_for_person && (
            <span
              className="font-mono text-[10.5px] inline-flex items-center gap-1"
              style={{ color: 'rgb(var(--rose-glow))' }}
            >
              <User className="w-2.5 h-2.5" />
              {task.waiting_for_person}
            </span>
          )}

          {task.recurrence_rule && (
            <span
              className="font-mono text-[10.5px] inline-flex items-center gap-1"
              style={{ color: 'rgb(var(--violet-glow))' }}
            >
              <Repeat className="w-2.5 h-2.5" />
              {task.recurrence_rule}
            </span>
          )}

          {task.start_date && (
            <span className="font-mono text-[10.5px] text-text-3 inline-flex items-center gap-1">
              <CalendarClock className="w-2.5 h-2.5" />
              starts {task.start_date}
            </span>
          )}

          {task.scheduled_time && (
            <span
              className="font-mono text-[10.5px] inline-flex items-center gap-1"
              style={{ color: 'rgb(var(--violet-glow))' }}
            >
              <Clock className="w-2.5 h-2.5" />
              {formatScheduledTime(task.scheduled_time)}
              {task.duration ? ` · ${task.duration}m` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Right tags */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0 group-hover:opacity-0 transition-opacity">
        {queued && (
          <span
            className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgb(var(--text-3))' }}
          >
            queued
          </span>
        )}
        {focus && (
          <span
            className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md inline-flex items-center gap-1"
            style={{ background: 'rgb(var(--amber) / 0.14)', color: 'rgb(var(--amber-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)' }}
          >
            today
          </span>
        )}
      </div>
    </div>
  );
}

