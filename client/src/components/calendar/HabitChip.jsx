import { Check } from 'lucide-react';

const PART_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

// A habit in the calendar's all-day row: one without a set time, or one whose
// part of the day had no free gap. Clicking marks it done for that day.
export default function HabitChip({ habit, onToggle }) {
  const done = habit.status === 'done';
  const when = habit.scheduled_time || PART_LABEL[habit.timeOfDay] || '';
  return (
    <button
      type="button"
      onClick={() => onToggle?.(habit.id)}
      className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left transition-opacity"
      style={{
        background: `${habit.color}14`,
        boxShadow: `inset 0 0 0 1px ${habit.color}40`,
        opacity: done ? 0.55 : 1,
      }}
      title={`${habit.title}${when ? ` · ${when}` : ''}${habit.duration ? ` · ${habit.duration}m` : ''} — habit, click to ${done ? 'undo' : 'mark done'}`}
    >
      <span
        className="grid place-items-center w-3 h-3 rounded-full shrink-0"
        style={{ boxShadow: `inset 0 0 0 1.5px ${habit.color}`, background: done ? habit.color : 'transparent' }}
      >
        {done && <Check className="w-2 h-2" style={{ color: '#0a0a0f' }} strokeWidth={4} />}
      </span>
      <span className={`text-[10.5px] font-medium truncate ${done ? 'line-through' : ''}`} style={{ color: habit.color }}>
        {habit.title}
      </span>
      {when && <span className="font-mono text-[9px] text-text-3 shrink-0 ml-auto">{when}</span>}
    </button>
  );
}
