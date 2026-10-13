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
  const isFocus = !!task.is_daily_focus;
  // This card is a clone shown on the task's start_date (see Calendar.itemsByDate).
  // It must NOT be draggable: the drop handler only knows the task id and always
  // writes due_date, so dragging the start marker silently moved the DUE date.
  const isStartMarker = task._calendarDate === 'start';
  // Week-plan proposal (not saved): dashed and striped; its drop and complete
  // are routed to the open plan by the Calendar page.
  const isDraft = !!task._draft;

  return (
    <div
      draggable={!isStartMarker}
      onDragStart={isStartMarker ? undefined : (e) => {
        e.dataTransfer.setData('text/plain', task.id.toString());
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task.id);
      }}
      onClick={() => onEdit?.(task)}
      title={isDraft ? (task._draftUnfit ? 'Proposed for this day — no free slot found' : 'Proposed for this day — not saved until you apply the plan') : isStartMarker ? 'Starts this day — edit the task to change its start date' : undefined}
      className="group relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] cursor-pointer transition-all"
      style={isDraft ? {
        background: 'repeating-linear-gradient(135deg, rgb(var(--violet) / 0.20) 0 6px, rgb(var(--violet) / 0.07) 6px 12px)',
        border: `1px dashed ${task._draftUnfit ? 'rgb(var(--rose-glow) / 0.75)' : 'rgb(var(--violet-glow) / 0.75)'}`,
        color: 'rgb(var(--text-1))',
      } : {
        background: overdue ? 'rgba(251,113,133,0.10)' : tone.bg,
        border: `1px ${isStartMarker ? 'dashed' : 'solid'} ${overdue ? 'rgba(251,113,133,0.25)' : tone.border}`,
        color: overdue ? 'rgb(var(--rose-glow))' : tone.text,
        opacity: isStartMarker ? 0.7 : 1,
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
        className="tap-expand grid place-items-center w-3 h-3 rounded-full border shrink-0"
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
