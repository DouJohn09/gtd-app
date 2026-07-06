import { useState } from 'react';
import { CalendarClock, Check, Clock, ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { contextLabel } from '../lib/context';
import { useToast } from './Toast';
import { aiToast } from '../lib/aiError';

/**
 * Review step for the AI day plan. Blocks are keep/skip (tap to toggle);
 * nothing is written until "Apply plan" — then kept blocks become today's
 * time-blocked focus and deferred items move to their new date. The server
 * already guaranteed the block times are conflict-free (packPlan), so this
 * panel is about consent, not correction.
 */
export default function PlanReviewPanel({ result, onApplied, onCancel }) {
  const { addToast } = useToast();
  const plan = result?.plan || [];
  const deferred = result?.deferred || [];
  const tasks = result?.tasks || [];
  const [skipped, setSkipped] = useState(() => new Set());
  const [applying, setApplying] = useState(false);

  const taskFor = (idx) => tasks[idx - 1];
  const keptBlocks = plan.filter(b => !skipped.has(b.task_index));

  const toggle = (idx) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const endTime = (b) => {
    const [h, m] = b.start.split(':').map(Number);
    const end = h * 60 + m + b.duration_mins;
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  };

  const apply = async () => {
    setApplying(true);
    try {
      const items = keptBlocks
        .map(b => ({ taskId: taskFor(b.task_index)?.id, start: b.start, duration: b.duration_mins }))
        .filter(i => i.taskId);
      const defer = deferred
        .map(d => ({ taskId: taskFor(d.task_index)?.id, moveTo: d.move_to }))
        .filter(d => d.taskId && d.moveTo);
      const r = await api.ai.applyPlan(items, defer);
      addToast(
        `Day planned — ${r.applied} block${r.applied === 1 ? '' : 's'}${r.deferred ? `, ${r.deferred} moved` : ''}.`,
        'success'
      );
      onApplied();
    } catch (err) {
      addToast(...aiToast(err, 'Could not apply the plan. Nothing was changed.'));
      setApplying(false);
    }
  };

  return (
    <div className="rounded-2xl glass p-4 mb-5" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'rgb(var(--violet-glow))' }}>
          <CalendarClock className="w-3.5 h-3.5" /> today&rsquo;s plan · {plan.length} block{plan.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={onCancel}
          className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors"
        >
          cancel
        </button>
      </div>

      {result.summary && (
        <p className="text-[13px] text-text-2 leading-relaxed mb-3">{result.summary}</p>
      )}

      <div className="space-y-2">
        {plan.map((b) => {
          const task = taskFor(b.task_index);
          if (!task) return null;
          const isKept = !skipped.has(b.task_index);
          return (
            <button
              key={b.task_index}
              type="button"
              onClick={() => toggle(b.task_index)}
              className="w-full text-left rounded-xl p-3 flex items-start gap-3 transition-all"
              style={{
                background: 'rgba(255,255,255,0.02)',
                boxShadow: `inset 0 0 0 1px ${isKept ? 'rgb(var(--violet) / 0.22)' : 'rgba(255,255,255,0.05)'}`,
                opacity: isKept ? 1 : 0.5,
              }}
            >
              <span
                className="mt-0.5 w-4 h-4 rounded-md grid place-items-center flex-shrink-0"
                style={{
                  background: isKept ? 'rgb(var(--violet) / 0.85)' : 'transparent',
                  boxShadow: isKept ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,0.2)',
                }}
              >
                {isKept && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
              <div className="font-mono text-[12px] text-text-1 flex-shrink-0 w-[7.5rem]">
                {b.start}–{endTime(b)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] leading-snug [overflow-wrap:anywhere]">{task.title}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono text-[10.5px] text-text-3 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />{b.duration_mins}m
                  </span>
                  {task.context && <span className="context-badge">{contextLabel(task.context)}</span>}
                </div>
                {b.reason && <p className="text-[11.5px] text-text-3 mt-1 leading-relaxed">{b.reason}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {deferred.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 mb-1.5 inline-flex items-center gap-1.5">
            {result.overloaded && <AlertTriangle className="w-3 h-3" style={{ color: 'rgb(var(--amber-glow))' }} />}
            moved off today — that&rsquo;s the plan protecting your day
          </div>
          <div className="space-y-1.5">
            {deferred.map((d) => {
              const task = taskFor(d.task_index);
              if (!task) return null;
              return (
                <div key={d.task_index} className="rounded-xl px-3 py-2 flex items-center gap-2.5" style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                  <ArrowRight className="w-3 h-3 text-text-3 flex-shrink-0" />
                  <span className="text-[12.5px] text-text-2 flex-1 min-w-0 truncate">{task.title}</span>
                  <span className="font-mono text-[10.5px] text-text-3 flex-shrink-0">{d.move_to}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3.5">
        <button
          onClick={apply}
          disabled={applying || (keptBlocks.length === 0 && deferred.length === 0)}
          className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50"
        >
          {applying ? 'Applying…' : `Apply plan${keptBlocks.length ? ` · ${keptBlocks.length}` : ''}`}
        </button>
        <button onClick={onCancel} disabled={applying} className="gtd-btn gtd-btn-secondary text-[12.5px]">
          Not today
        </button>
      </div>
    </div>
  );
}
