import { useState } from 'react';
import { Moon, X, ArrowRight, CalendarClock, Wind } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

/**
 * The evening shutdown — the plan's honest ending. Shown when a plan was
 * applied today, blocks remain, and the day is winding down (≥17:00 local
 * or most of the plan done). Each unfinished block gets one-tap outcomes:
 * tomorrow (unscheduled), a free slot tomorrow (deterministic findFreeSlot,
 * no AI), or let it go (back to next actions, no date). Punting is framed
 * as closure, not failure — the goal is ending the day with a clear head.
 */
export default function DayShutdown({ brief, onChanged, onDismissed, hidden }) {
  const { addToast } = useToast();
  const [dismissedDate, setDismissedDate] = useState(() => localStorage.getItem('ct_shutdown_dismissed'));
  const [busyId, setBusyId] = useState(null);

  if (hidden || !brief?.plan?.applied || dismissedDate === brief.date) return null;
  const unfinished = brief.unfinished || [];
  if (unfinished.length === 0) return null;

  const { done, total } = brief.plan;
  const evening = new Date().getHours() >= 17;
  const mostlyDone = total > 0 && done / total > 0.6;
  if (!evening && !mostlyDone) return null;

  const dismiss = () => {
    localStorage.setItem('ct_shutdown_dismissed', brief.date);
    setDismissedDate(brief.date);
    onDismissed?.();
  };

  const defer = async (task, mode) => {
    setBusyId(task.id);
    try {
      const r = await api.ai.shutdownDefer(task.id, mode);
      addToast(
        mode === 'release'
          ? 'Back on the list — today just didn’t have room.'
          : r.scheduled_time
            ? `Moved to tomorrow at ${r.scheduled_time}.`
            : 'Moved to tomorrow.',
        'success'
      );
      onChanged();
    } catch {
      addToast('Could not move the task — it’s unchanged.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl glass p-4 mb-5" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-text-3">
          <Moon className="w-3.5 h-3.5" /> winding down · {done}/{total} done
        </span>
        <button onClick={dismiss} aria-label="Dismiss shutdown" className="grid place-items-center w-6 h-6 rounded-md text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[13px] text-text-2 leading-relaxed mb-3">
        {unfinished.length === 1 ? 'One block' : `${unfinished.length} blocks`} left from today&rsquo;s plan.
        Decide where {unfinished.length === 1 ? 'it goes' : 'they go'} and close the day.
      </p>

      <div className="space-y-1.5">
        {unfinished.map(task => (
          <div
            key={task.id}
            className="rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)', opacity: busyId === task.id ? 0.5 : 1 }}
          >
            <span className="font-mono text-[10.5px] text-text-3 flex-shrink-0">{task.scheduled_time}</span>
            <span className="text-[13px] text-text-1 flex-1 min-w-[10rem] truncate">{task.title}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => defer(task, 'tomorrow')}
                disabled={busyId !== null}
                title="Move to tomorrow, pick a time later"
                className="gtd-btn gtd-btn-secondary !py-1 !px-2 text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <ArrowRight className="w-3 h-3" /> tomorrow
              </button>
              <button
                onClick={() => defer(task, 'slot')}
                disabled={busyId !== null}
                title="Move into tomorrow's first free slot"
                className="gtd-btn gtd-btn-secondary !py-1 !px-2 text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <CalendarClock className="w-3 h-3" /> slot
              </button>
              <button
                onClick={() => defer(task, 'release')}
                disabled={busyId !== null}
                title="Back to Next Actions, no date"
                className="gtd-btn gtd-btn-secondary !py-1 !px-2 text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Wind className="w-3 h-3" /> let it go
              </button>
            </div>
          </div>
        ))}
      </div>

      {brief.daysPlanned > 1 && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-3 mt-3">
          {brief.daysPlanned} days planned so far
        </div>
      )}
    </div>
  );
}
