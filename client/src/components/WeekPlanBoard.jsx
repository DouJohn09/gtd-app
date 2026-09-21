import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Check, Clock, PencilLine, Sparkles, CheckCircle2, RefreshCw, CalendarClock } from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';
import { api } from '../lib/api';
import { contextLabel } from '../lib/context';
import { useToast } from './Toast';
import { aiToast } from '../lib/aiError';

/**
 * "Plan my week" — the AI proposes WHICH DAY each open next action belongs to
 * (no times; the morning planner does those). Seven columns, today first.
 * Drag a card to another day, untick to leave it out, "open" to edit the task.
 * Nothing is written until Apply: kept placements get their do-date
 * (due_date), untimed. Already-dated tasks show greyed for context.
 *
 * `result` is the /ai/plan-week response; `onOpenTask(task)` opens the editor;
 * `onApplied()` / `onCancel()` close the board.
 */
export default function WeekPlanBoard({ result, onApplied, onCancel, onOpenTask, onReplan, compact = false }) {
  const { addToast } = useToast();
  const tasks = useMemo(() => new Map((result?.tasks || []).map(t => [t.id, t])), [result]);
  const days = result?.days || [];
  const start = result?.start;

  // placements: taskId → date (null = left out). Seeded from the proposal.
  const [where, setWhere] = useState(() => {
    const m = new Map();
    for (const p of result?.placements || []) m.set(p.taskId, p.date);
    return m;
  });
  const [omitted, setOmitted] = useState(() => new Set());
  const [reasons] = useState(() => {
    const m = new Map();
    for (const p of result?.placements || []) m.set(p.taskId, p.reason);
    for (const u of result?.unplaced || []) m.set(u.taskId, u.reason);
    return m;
  });
  const [dragOver, setDragOver] = useState(null);
  const [applying, setApplying] = useState(false);
  // Tasks ticked off straight from the board: completed on the server, gone
  // from the draft. Nothing else about the plan changes.
  const [completed, setCompleted] = useState(() => new Set());
  const [confirmReplan, setConfirmReplan] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const liveTasks = (result?.tasks || []).filter(t => !completed.has(t.id));

  const completeTask = async (task) => {
    try {
      await api.tasks.complete(task.id);
      setCompleted(prev => new Set(prev).add(task.id));
      setWhere(prev => { const n = new Map(prev); n.delete(task.id); return n; });
      addToast(`Done: ${task.title}`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not complete the task.', 'error');
    }
  };
  const replan = async () => {
    setConfirmReplan(false);
    if (!onReplan) return;
    setReplanning(true);
    try { await onReplan(); } finally { setReplanning(false); }
  };
  const [showWeekend, setShowWeekend] = useState(() => days.some(d => isWeekend(d.date) && (d.capacityMins > 0 && (result?.placements || []).some(p => p.date === d.date))));

  const minsOf = (t) => t?.time_estimate || 30;
  const plannedMins = (date) => [...where.entries()].filter(([id, d]) => d === date && !omitted.has(id)).reduce((s, [id]) => s + minsOf(tasks.get(id)), 0);
  const unplaced = liveTasks.filter(t => !where.has(t.id));
  const keptCount = [...where.entries()].filter(([id, d]) => d && !omitted.has(id)).length;

  // Time windows: optional second pass. With it on, every change to the board
  // re-packs each day's tasks into that day's free ranges on the server
  // (deterministic, no AI) and Apply writes the blocks + Google Calendar events.
  const [withTimes, setWithTimes] = useState(false);
  const [times, setTimes] = useState(() => new Map()); // taskId → { start, duration }
  const [unfit, setUnfit] = useState(() => new Set());
  const [timing, setTiming] = useState(false);
  const timesReq = useRef(0);
  const placementsKey = [...where.entries()].filter(([id, d]) => d && !omitted.has(id) && !completed.has(id)).map(([id, d]) => `${id}:${d}`).sort().join(',');
  useEffect(() => {
    if (!withTimes) return;
    const placements = [...where.entries()].filter(([id, d]) => d && !omitted.has(id) && !completed.has(id)).map(([taskId, date]) => ({ taskId, date }));
    const seq = ++timesReq.current;
    setTiming(true);
    api.ai.weekTimes(start, placements)
      .then((r) => {
        if (seq !== timesReq.current) return;
        setTimes(new Map((r.times || []).map(t => [t.taskId, { start: t.start, duration: t.duration }])));
        setUnfit(new Set((r.unfit || []).map(u => u.taskId)));
      })
      .catch((err) => { if (seq === timesReq.current) addToast(...aiToast(err, 'Could not compute time windows.')); })
      .finally(() => { if (seq === timesReq.current) setTiming(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withTimes, placementsKey, start]);
  const endOf = (t) => { const [h, m] = t.start.split(':').map(Number); const e = h * 60 + m + t.duration; return `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; };

  const moveTo = (taskId, date) => setWhere(prev => { const n = new Map(prev); n.set(taskId, date); return n; });
  const toggleOmit = (taskId) => setOmitted(prev => { const n = new Set(prev); if (n.has(taskId)) n.delete(taskId); else n.add(taskId); return n; });

  const onDragStart = (e, taskId) => { e.dataTransfer.setData('text/plain', String(taskId)); e.dataTransfer.effectAllowed = 'move'; };
  const onDropDay = (e, date) => {
    e.preventDefault(); setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id) { moveTo(id, date); setOmitted(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };
  const onDropUnplaced = (e) => {
    e.preventDefault(); setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id) setWhere(prev => { const n = new Map(prev); n.delete(id); return n; });
  };

  const apply = async () => {
    setApplying(true);
    try {
      const items = [...where.entries()].filter(([id, d]) => d && !omitted.has(id)).map(([taskId, date]) => {
        const t = withTimes ? times.get(taskId) : null;
        return t ? { taskId, date, start: t.start, duration: t.duration } : { taskId, date };
      });
      const r = await api.ai.applyWeek(start, items);
      addToast(withTimes ? `Week planned — ${r.applied} task${r.applied === 1 ? '' : 's'} time-blocked.` : `Week planned — ${r.applied} task${r.applied === 1 ? '' : 's'} given a day.`, 'success');
      onApplied?.();
    } catch (err) {
      addToast(...aiToast(err, 'Could not apply the week. Nothing was changed.'));
      setApplying(false);
    }
  };

  const visibleDays = days.filter(d => showWeekend || !isWeekend(d.date) || d.date === start);

  return (
    <div className="rounded-2xl glass p-4 mb-5" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}>
      <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'rgb(var(--violet-glow))' }}>
          <CalendarRange className="w-3.5 h-3.5" /> the week ahead · {keptCount} task{keptCount === 1 ? '' : 's'} placed
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWithTimes(v => !v)}
            className="font-mono text-[10.5px] uppercase tracking-wider inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors"
            style={withTimes
              ? { color: 'rgb(var(--violet-glow))', background: 'rgb(var(--violet) / 0.14)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.3)' }
              : { color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
            title={withTimes ? 'Back to days only' : 'Pack each day into time blocks and sync them to Google Calendar on apply'}
          >
            <CalendarClock className={`w-3 h-3 ${timing ? 'animate-pulse' : ''}`} /> {withTimes ? 'with times' : 'days only'}
          </button>
          {onReplan && (
            <button onClick={() => setConfirmReplan(true)} disabled={replanning} className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors inline-flex items-center gap-1 disabled:opacity-60" title="Ask the AI again with your current estimates and dates">
              <RefreshCw className={`w-3 h-3 ${replanning ? 'animate-spin' : ''}`} /> {replanning ? 'replanning' : 'replan'}
            </button>
          )}
          {days.some(d => isWeekend(d.date) && d.date !== start) && (
            <button onClick={() => setShowWeekend(v => !v)} className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors">
              {showWeekend ? 'hide weekend' : 'show weekend'}
            </button>
          )}
          <button onClick={onCancel} className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors">cancel</button>
        </div>
      </div>
      {result?.summary && <p className="text-[13px] text-text-2 leading-relaxed mb-3">{result.summary}</p>}

      <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3 xl:grid-cols-7'}`}>
        {visibleDays.map((d) => {
          const isToday = d.date === start;
          const planned = plannedMins(d.date);
          const cap = d.capacityMins;
          const ratio = cap > 0 ? Math.min(1.2, planned / cap) : (planned > 0 ? 1.2 : 0);
          const over = cap > 0 ? planned > cap : planned > 0;
          const cards = liveTasks.filter(t => where.get(t.id) === d.date)
            .sort((a, b) => (withTimes ? (times.get(a.id)?.start || '99').localeCompare(times.get(b.id)?.start || '99') : 0));
          const isOver = dragOver === d.date;
          return (
            <div
              key={d.date}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(d.date); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDropDay(e, d.date)}
              className="rounded-xl p-2 flex flex-col min-h-[140px] transition-colors"
              style={{
                background: isOver ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)',
                boxShadow: `inset 0 0 0 1px ${isOver ? 'rgba(167,139,250,0.5)' : isToday ? 'rgb(var(--violet) / 0.35)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-baseline justify-between px-1 mb-1.5">
                <div>
                  <div className="mono-label text-[9.5px]">{d.dayName.slice(0, 3)}{isToday ? ' · today' : ''}</div>
                  <div className="font-display text-[17px] leading-none mt-0.5">{Number(d.date.slice(8, 10))}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px]" style={{ color: over ? 'rgb(var(--rose-glow))' : 'rgb(var(--text-3))' }}>{planned}/{cap}m</div>
                  {d.meetings > 0 && <div className="font-mono text-[9.5px] text-text-3">{d.meetings} mtg · {Math.round(d.busyMins / 60 * 10) / 10}h</div>}
                </div>
              </div>
              <div className="h-1 rounded-full mb-2 mx-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: over ? 'rgb(var(--rose))' : ratio > 0.85 ? 'rgb(var(--amber))' : 'rgb(var(--violet))' }} />
              </div>

              {d.fixed?.length > 0 && (
                <div className="space-y-1 mb-1.5">
                  {d.fixed.map(f => (
                    <div key={f.id} className="rounded-lg px-2 py-1.5 text-[11.5px] text-text-3 truncate" style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }} title="Already on this day">
                      {f.timed ? '◔ ' : '· '}{f.title}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 flex-1">
                {cards.map(t => (
                  <Card key={t.id} task={t} reason={reasons.get(t.id)} omitted={omitted.has(t.id)}
                    time={withTimes ? (times.get(t.id) ? `${times.get(t.id).start}–${endOf(times.get(t.id))}` : (unfit.has(t.id) ? 'no slot' : null)) : null}
                    onToggle={() => toggleOmit(t.id)} onOpen={onOpenTask ? () => onOpenTask(t) : null} onComplete={() => completeTask(t)} onDragStart={(e) => onDragStart(e, t.id)} />
                ))}
                {cards.length === 0 && <div className="text-[11px] text-text-3 px-1 py-3 text-center">drop tasks here</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver('unplaced'); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDropUnplaced}
        className="mt-3 rounded-xl p-2"
        style={{ background: dragOver === 'unplaced' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        <div className="mono-label text-[9.5px] px-1 mb-1.5">not this week · {unplaced.length}</div>
        {unplaced.length === 0 ? (
          <div className="text-[11px] text-text-3 px-1 pb-1">Everything found a day. Drag a card here to leave it for later.</div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {unplaced.map(t => (
              <Card key={t.id} task={t} reason={reasons.get(t.id)} muted onOpen={onOpenTask ? () => onOpenTask(t) : null} onComplete={() => completeTask(t)} onDragStart={(e) => onDragStart(e, t.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <p className="text-[11.5px] text-text-3 inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> {withTimes
          ? 'Time blocks go to your calendar on apply; drag them in the Calendar to fine-tune.'
          : 'Days only. Each morning, “Plan my day” puts that day’s tasks into time blocks.'}</p>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="gtd-btn gtd-btn-secondary text-[12.5px]">Cancel</button>
          <button onClick={apply} disabled={applying || keptCount === 0} className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 text-[12.5px] disabled:opacity-60">
            {applying ? 'Applying…' : `Apply week · ${keptCount}`} <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {confirmReplan && (
        <ConfirmModal
          title="Replan the week?"
          message="The AI will lay the week out again using your current estimates, dates and what's already done. Any cards you moved, left out or reordered on this board will be lost — apply first if you want to keep them."
          confirmLabel="Replan"
          tone="violet"
          onConfirm={replan}
          onCancel={() => setConfirmReplan(false)}
        />
      )}
    </div>
  );
}

function Card({ task, reason, time = null, omitted = false, muted = false, onToggle, onOpen, onComplete, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing transition-opacity"
      style={{ background: 'rgba(255,255,255,0.03)', boxShadow: `inset 0 0 0 1px ${omitted ? 'rgba(255,255,255,0.05)' : 'rgb(var(--violet) / 0.18)'}`, opacity: omitted || muted ? 0.55 : 1 }}
      title={reason || undefined}
    >
      <div className="flex items-start gap-1.5">
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={omitted ? 'Include' : 'Leave out'}
            className="mt-0.5 w-3.5 h-3.5 rounded grid place-items-center flex-shrink-0"
            style={{ background: omitted ? 'transparent' : 'rgb(var(--violet) / 0.85)', boxShadow: omitted ? 'inset 0 0 0 1.5px rgba(255,255,255,0.2)' : 'none' }}>
            {!omitted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          {time && (
            <div className="font-mono text-[10px] mb-0.5" style={{ color: time === 'no slot' ? 'rgb(var(--rose-glow))' : 'rgb(var(--violet-glow))' }}>{time}</div>
          )}
          <div className="text-[12px] leading-snug [overflow-wrap:anywhere]">{task.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="font-mono text-[9.5px] text-text-3 inline-flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{task.time_estimate || 30}m</span>
            {task.context && <span className="font-mono text-[9.5px] text-text-3">{contextLabel(task.context)}</span>}
            {task.due_date && <span className="font-mono text-[9.5px]" style={{ color: 'rgb(var(--amber-glow))' }}>due {String(task.due_date).slice(5, 10)}</span>}
            <span className="ml-auto inline-flex items-center gap-2">
              {onComplete && (
                <button type="button" onClick={onComplete} title="Already done — complete it" className="font-mono text-[9.5px] text-text-3 hover:text-mint-glow inline-flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> done
                </button>
              )}
              {onOpen && (
                <button type="button" onClick={onOpen} className="font-mono text-[9.5px] text-text-3 hover:text-violet-glow inline-flex items-center gap-0.5">
                  <PencilLine className="w-2.5 h-2.5" /> open
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}
