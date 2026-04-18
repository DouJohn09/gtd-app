import { isOverdue } from '../lib/dateUtils';

const LIST_TONE = {
  inbox:         { dot: 'rgb(var(--amber))',  bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.18)',  text: 'rgb(var(--amber-glow))' },
  next_actions:  { dot: 'rgb(var(--mint))',   bg: 'rgba(94,234,212,0.08)',  border: 'rgba(94,234,212,0.18)',  text: 'rgb(var(--mint-glow))' },
  waiting_for:   { dot: 'rgb(var(--rose))',   bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.18)', text: 'rgb(var(--rose-glow))' },
  someday_maybe: { dot: 'rgb(var(--violet))', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.18)', text: 'rgb(var(--violet-glow))' },
};

const ENERGY_DOT = {
  low:    'rgb(var(--mint))',
  medium: 'rgb(var(--amber))',
  high:   'rgb(var(--rose))',
};

export default function CalendarTaskCard({ task, onEdit, onComplete, onDragStart }) {
  const overdue = isOverdue(task.due_date);
  const tone = LIST_TONE[task.list] || LIST_TONE.next_actions;
  const isFocus = task.is_daily_focus === 1;

  return (
    <div
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id.toString());
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task.id);
      }}
      onClick={() => onEdit?.(task)}
      className="group relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] cursor-pointer transition-all"
      style={{
        background: overdue ? 'rgba(251,113,133,0.10)' : tone.bg,
        border: `1px solid ${overdue ? 'rgba(251,113,133,0.25)' : tone.border}`,
        color: overdue ? 'rgb(var(--rose-glow))' : tone.text,
      }}
    >
      {isFocus && (
        <span
          className="absolute -left-px top-1 bottom-1 w-[2px] rounded-r"
          style={{ background: 'rgb(var(--amber))', boxShadow: '0 0 8px rgba(251,191,36,0.6)' }}
        />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onComplete?.(task.id); }}
        className="grid place-items-center w-3 h-3 rounded-full border shrink-0"
        style={{ borderColor: 'currentColor', opacity: 0.7 }}
        aria-label="Complete"
      />
      <span className="truncate flex-1">{task.title}</span>
      {task.energy_level && ENERGY_DOT[task.energy_level] && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ENERGY_DOT[task.energy_level] }} />
      )}
    </div>
  );
}
