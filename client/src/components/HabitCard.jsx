import { useRef } from 'react';
import { Flame, Pencil, Trash2, Calendar, Check, Minus, Shield, X } from 'lucide-react';

export default function HabitCard({ habit, onToggle, onEdit, onDelete }) {
  const dateInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];
  const isQuit = habit.type === 'quit';
  // Build habits: done | skipped (rest day) | none. Quit habits: a logged day is
  // a slip, so the only states are slip | none (clean). Fall back to the legacy
  // boolean for any habit object not yet refreshed with today_status.
  const status = habit.today_status || (habit.completed_today ? 'done' : 'none');
  const done = !isQuit && status === 'done';
  const skipped = !isQuit && status === 'skipped';
  const slipped = isQuit && status === 'slip';

  const handleDateChange = (e) => {
    const date = e.target.value;
    if (date) {
      onToggle(habit.id, date);
      e.target.value = '';
    }
  };

  return (
    <div
      className="rounded-2xl glass p-3.5 flex items-center gap-3 group transition-all"
      style={
        done
          ? { boxShadow: '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 1px 0 rgb(255 255 255 / 0.05), inset 0 0 0 1px rgba(255,255,255,0.05), inset 3px 0 0 rgb(var(--mint-glow))' }
          : skipped
            ? { boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05), inset 0 0 0 1px rgba(255,255,255,0.05), inset 3px 0 0 rgba(255,255,255,0.18)' }
            : slipped
              ? { boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05), inset 0 0 0 1px rgba(255,255,255,0.05), inset 3px 0 0 rgb(var(--rose-glow))' }
              : undefined
      }
    >
      <button
        onClick={() => onToggle(habit.id)}
        title={
          isQuit
            ? (slipped ? 'Slipped today — tap to undo' : 'Staying clean — tap only if you slipped')
            : (done ? 'Done — tap to mark as a rest day' : skipped ? 'Rest day — tap to clear' : 'Tap to mark done')
        }
        aria-label={
          isQuit
            ? (slipped ? 'Slipped today. Tap to undo.' : 'Clean today. Tap to log a slip.')
            : (done ? 'Done. Tap to mark as a rest day.' : skipped ? 'Rest day. Tap to clear.' : 'Not done. Tap to mark done.')
        }
        className="fresh-check w-6 h-6 rounded-full grid place-items-center transition-all flex-shrink-0"
        style={
          done
            ? {
                background: 'linear-gradient(180deg, rgb(var(--mint) / 0.85), rgb(var(--mint) / 0.65))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 14px rgb(var(--mint) / 0.4)',
              }
            : skipped
              ? { background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.14)' }
              : slipped
                ? { background: 'rgb(var(--rose) / 0.18)', boxShadow: 'inset 0 0 0 1.5px rgb(var(--rose) / 0.45)' }
                : { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18)' }
        }
      >
        {done && <Check className="w-3.5 h-3.5 text-bg" strokeWidth={3} />}
        {skipped && <Minus className="w-3.5 h-3.5 text-text-3" strokeWidth={3} />}
        {slipped && <X className="w-3.5 h-3.5" strokeWidth={3} style={{ color: 'rgb(var(--rose-glow))' }} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[14px] font-medium ${done ? 'line-through text-text-3' : skipped ? 'text-text-3' : 'text-text-1'}`}>
            {habit.name}
          </span>
          {isQuit && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-3 px-1.5 py-0.5 rounded-md" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}>
              quit
            </span>
          )}
          {skipped && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-3 px-1.5 py-0.5 rounded-md" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}>
              rest day
            </span>
          )}
          {slipped && (
            <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ color: 'rgb(var(--rose-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.30)' }}>
              slipped today
            </span>
          )}
          {habit.category && (
            <span
              className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md"
              style={{ background: `${habit.color}20`, color: habit.color, boxShadow: `inset 0 0 0 1px ${habit.color}40` }}
            >
              {habit.category}
            </span>
          )}
        </div>
        {habit.description && (
          <p className="text-[12px] text-text-3 truncate mt-0.5">{habit.description}</p>
        )}
      </div>

      {habit.streak > 0 && (
        isQuit ? (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full flex-shrink-0"
            style={{ background: 'rgb(var(--mint) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.22)' }}
            title={`${habit.streak} days clean`}
          >
            <Shield className="w-3 h-3" style={{ color: 'rgb(var(--mint-glow))' }} />
            <span className="font-mono text-[11px]" style={{ color: 'rgb(var(--mint-glow))' }}>{habit.streak}d clean</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full flex-shrink-0"
            style={{ background: 'rgb(var(--amber) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.22)' }}
          >
            <Flame className="w-3 h-3" style={{ color: 'rgb(var(--amber-glow))' }} />
            <span className="font-mono text-[11px]" style={{ color: 'rgb(var(--amber-glow))' }}>{habit.streak}{habit.streakUnit === 'week' ? 'w' : ''}</span>
          </div>
        )
      )}

      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
            className="p-1.5 text-text-3 hover:text-violet-glow rounded-lg transition-colors"
            title="Log for another date"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            max={today}
            onChange={handleDateChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            tabIndex={-1}
          />
        </div>
        <button
          onClick={() => onEdit(habit)}
          className="p-1.5 text-text-3 hover:text-text-1 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(habit.id)}
          className="p-1.5 text-text-3 hover:text-rose-glow rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
