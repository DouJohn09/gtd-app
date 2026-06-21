import { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react';
import { api } from '../lib/api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-start, matching habit streak logic

// All date math is UTC on 'YYYY-MM-DD' strings, matching the server (DATE columns
// come back as ISO strings and `today` is computed in UTC).
const pad = (n) => String(n).padStart(2, '0');
const ymdUTC = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStrUTC = () => new Date().toISOString().slice(0, 10);

// Click any day to cycle its state. Build habits: done → rest → clear. Quit
// habits: slip → clear (a logged day is a slip). Replaces the old native date
// picker, which could only set a day "done" and never cycle.
export default function HabitCalendar({ habit, onToggle, onClose }) {
  const isQuit = habit.type === 'quit';
  const todayStr = todayStrUTC();
  const anchorStr = habit.created_at ? String(habit.created_at).slice(0, 10) : null;

  const [year, setYear] = useState(Number(todayStr.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayStr.slice(5, 7)) - 1); // 0-11
  const [logs, setLogs] = useState({}); // 'YYYY-MM-DD' -> status
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.habits.logs(habit.id)
      .then(data => {
        if (!alive) return;
        const map = {};
        data.forEach(l => { map[l.date] = l.status; });
        setLogs(map);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [habit.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const cells = useMemo(() => {
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
    const lead = (firstDow + 6) % 7; // Monday-start offset
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(ymdUTC(year, month, d));
    return out;
  }, [year, month]);

  const goPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  };
  const goNext = () => {
    if (year === Number(todayStr.slice(0, 4)) && month >= Number(todayStr.slice(5, 7)) - 1) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  };
  const atCurrentMonth = year === Number(todayStr.slice(0, 4)) && month === Number(todayStr.slice(5, 7)) - 1;

  const handleDayClick = async (dateStr) => {
    if (!dateStr || dateStr > todayStr || busy) return;
    setBusy(true);
    try {
      const r = await onToggle(habit.id, dateStr, { silent: true });
      if (r) {
        setLogs(prev => {
          const next = { ...prev };
          if (r.status === 'none') delete next[dateStr];
          else next[dateStr] = r.status;
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const cellStyle = (dateStr) => {
    const status = logs[dateStr];
    const future = dateStr > todayStr;
    if (future) return { opacity: 0.25 };
    if (status === 'done') {
      return { background: 'linear-gradient(180deg, rgb(var(--mint) / 0.85), rgb(var(--mint) / 0.6))', color: 'rgb(var(--bg))' };
    }
    if (status === 'skipped') {
      return { background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)', color: 'rgb(var(--text-3))' };
    }
    if (status === 'slip') {
      return { background: 'rgb(var(--rose) / 0.20)', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.45)', color: 'rgb(var(--rose-glow))' };
    }
    // No log. For quit habits, a day since creation with no slip is a clean day.
    if (isQuit && anchorStr && dateStr >= anchorStr) {
      return { background: 'rgb(var(--mint) / 0.10)', color: 'rgb(var(--text-2))' };
    }
    return { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: 'rgb(var(--text-2))' };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[340px] rounded-2xl glass overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--mint) / 0.16)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-white/[0.05]">
          <div className="min-w-0">
            <div className="mono-label" style={{ color: 'rgb(var(--mint-glow))' }}>
              {isQuit ? 'log_a_slip' : 'log_history'}
            </div>
            <h2 className="font-display text-[20px] leading-tight mt-0.5 truncate">{habit.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={goPrev} className="p-1.5 text-text-3 hover:text-text-1 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-display text-[15px]">{MONTHS[month]} {year}</span>
            <button
              onClick={goNext}
              disabled={atCurrentMonth}
              className="p-1.5 text-text-3 hover:text-text-1 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-text-3"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map((d, i) => (
              <div key={i} className="text-center font-mono text-[10px] text-text-3">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          {loading ? (
            <div className="h-[200px] grid place-items-center">
              <div className="w-5 h-5 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((dateStr, i) => {
                if (!dateStr) return <div key={i} />;
                const future = dateStr > todayStr;
                const day = Number(dateStr.slice(8, 10));
                const status = logs[dateStr];
                const isToday = dateStr === todayStr;
                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(dateStr)}
                    disabled={future || busy}
                    title={future ? '' : dateStr}
                    className="relative aspect-square rounded-lg grid place-items-center text-[12px] font-medium transition-all disabled:cursor-default"
                    style={{ ...cellStyle(dateStr), ...(isToday ? { outline: '1px solid rgb(var(--mint) / 0.5)', outlineOffset: '-1px' } : {}) }}
                  >
                    {status === 'done' ? <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      : status === 'skipped' ? <Minus className="w-3.5 h-3.5" strokeWidth={3} />
                      : status === 'slip' ? <X className="w-3.5 h-3.5" strokeWidth={3} />
                      : day}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 mt-4 font-mono text-[10px] text-text-3">
            {isQuit ? (
              <>
                <span className="inline-flex items-center gap-1"><X className="w-3 h-3" style={{ color: 'rgb(var(--rose-glow))' }} /> slip</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgb(var(--mint) / 0.10)' }} /> clean</span>
                <span>tap a day to toggle</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" style={{ color: 'rgb(var(--mint-glow))' }} /> done</span>
                <span className="inline-flex items-center gap-1"><Minus className="w-3 h-3" /> rest</span>
                <span>tap to cycle</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
