import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check, Minus } from 'lucide-react';
import { api } from '../lib/api';
import { todayStr } from '../lib/dateUtils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Monday-start, matching habit streak logic

// Grid cells are plain 'YYYY-MM-DD' strings (log dates come back keyed that way).
// "Today" must be the user's LOCAL day — the server derives the same day from the
// timezone header — so a user just after local midnight (east of UTC) or in the
// evening (west of UTC) sees the right cell enabled, not a UTC-shifted one.
const pad = (n) => String(n).padStart(2, '0');
const ymdUTC = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Click any day to cycle its state. Build habits: done → rest → clear. Quit
// habits: slip → clear (a logged day is a slip). Replaces the old native date
// picker, which could only set a day "done" and never cycle.
export default function HabitCalendar({ habit, onToggle, onClose }) {
  const isQuit = habit.type === 'quit';
  const today = todayStr();
  const anchorStr = habit.created_at ? String(habit.created_at).slice(0, 10) : null;

  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1); // 0-11
  const [logs, setLogs] = useState({}); // 'YYYY-MM-DD' -> { status, note }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today); // day the note editor targets
  const [noteDraft, setNoteDraft] = useState('');

  const statusOf = (d) => logs[d]?.status;

  useEffect(() => {
    let alive = true;
    api.habits.logs(habit.id)
      .then(data => {
        if (!alive) return;
        const map = {};
        data.forEach(l => { map[l.date] = { status: l.status, note: l.note || null }; });
        setLogs(map);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [habit.id]);

  // Sync the editor to the selected day's saved note — on selection change, on
  // load, and when the day's state is cleared/recreated. Not on every keystroke
  // (we only setLogs on blur), so typing isn't clobbered.
  useEffect(() => {
    setNoteDraft(logs[selectedDate]?.note || '');
  }, [selectedDate, logs[selectedDate]?.note]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (year === Number(today.slice(0, 4)) && month >= Number(today.slice(5, 7)) - 1) return;
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  };
  const atCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7)) - 1;

  // Clicking a day only SELECTS it (shows its state + note) — never mutates, so
  // opening a note can't accidentally change a logged day. State changes go through
  // the explicit buttons below.
  const handleDayClick = (dateStr) => {
    if (!dateStr || dateStr > today) return;
    setSelectedDate(dateStr);
  };

  const setStatus = async (target) => {
    if (busy || !selectedDate || selectedDate > today) return;
    setBusy(true);
    try {
      const r = await onToggle(habit.id, selectedDate, { silent: true, status: target });
      if (r) {
        setLogs(prev => {
          const next = { ...prev };
          if (r.status === 'none') delete next[selectedDate]; // clearing drops the note too
          else next[selectedDate] = { status: r.status, note: prev[selectedDate]?.note || null };
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  };

  // Save the note for the selected day (only meaningful if that day has a log).
  const commitNote = async () => {
    const draft = noteDraft.trim();
    if (!logs[selectedDate] || draft === (logs[selectedDate]?.note || '')) return;
    try {
      const r = await api.habits.setLogNote(habit.id, selectedDate, draft);
      setLogs(prev => ({ ...prev, [selectedDate]: { ...prev[selectedDate], note: r.note } }));
    } catch { /* keep draft on failure */ }
  };

  const cellStyle = (dateStr) => {
    const status = statusOf(dateStr);
    const future = dateStr > today;
    if (future) return { opacity: 0.4, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)', color: 'rgb(var(--text-3))' };
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

  // Portal to <body>: this modal is rendered from inside a .glass HabitCard, and
  // an ancestor with backdrop-filter (like transform/filter) becomes the containing
  // block for position:fixed descendants — which collapsed the overlay onto the
  // card instead of the viewport. Portaling out of the card fixes the positioning.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[340px] my-6 rounded-2xl"
        onClick={e => e.stopPropagation()}
        style={{
          // Fully opaque, no backdrop-filter, and NO height cap on the panel:
          // the .glass layer was too translucent, and a max-h + overflow on the
          // panel let the lower rows spill outside the painted background. The
          // panel now sizes to its content (solid bg covers all of it) and the
          // overlay scrolls if the viewport is short — same pattern as HabitModal.
          background: '#15151d',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 64px -16px rgba(0,0,0,0.6), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--mint) / 0.16)',
        }}
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
                const future = dateStr > today;
                const day = Number(dateStr.slice(8, 10));
                const status = statusOf(dateStr);
                const hasNote = !!logs[dateStr]?.note;
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(dateStr)}
                    disabled={future}
                    title={future ? '' : (logs[dateStr]?.note || dateStr)}
                    className="relative aspect-square rounded-lg grid place-items-center text-[12px] font-medium transition-all disabled:cursor-default"
                    style={{ ...cellStyle(dateStr), ...(isSelected && !future ? { outline: '1px solid rgb(var(--mint) / 0.6)', outlineOffset: '-1px' } : {}) }}
                  >
                    {status === 'done' ? <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      : status === 'skipped' ? <Minus className="w-3.5 h-3.5" strokeWidth={3} />
                      : status === 'slip' ? <X className="w-3.5 h-3.5" strokeWidth={3} />
                      : day}
                    {hasNote && (
                      <span className="absolute top-1 right-1 w-1 h-1 rounded-full" style={{ background: 'rgb(var(--amber-glow))' }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Detail for the selected day: set its state (explicit, non-destructive)
              and add an optional note. Selecting a day above never mutates it. */}
          {!loading && (() => {
            const sel = logs[selectedDate];
            const selStatus = sel?.status || 'none';
            const selFuture = selectedDate > today;
            const options = isQuit
              ? [{ v: 'slip', label: 'Slip' }, { v: 'none', label: 'Clean' }]
              : [{ v: 'done', label: 'Done' }, { v: 'skipped', label: 'Rest' }, { v: 'none', label: 'Clear' }];
            return (
              <div className="mt-3 pt-3 border-t border-white/[0.05]">
                <div className="mono-label mb-2 text-text-3">
                  {MONTHS[Number(selectedDate.slice(5, 7)) - 1].slice(0, 3)} {Number(selectedDate.slice(8, 10))}
                </div>
                <div className={`grid gap-1.5 mb-2 ${isQuit ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {options.map(opt => {
                    const active = selStatus === opt.v;
                    return (
                      <button
                        key={opt.v}
                        onClick={() => setStatus(opt.v)}
                        disabled={busy || selFuture}
                        className="py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-40"
                        style={active
                          ? { background: 'linear-gradient(180deg, rgb(var(--mint) / 0.22), rgb(var(--mint) / 0.10))', color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.35)' }
                          : { color: 'rgb(var(--text-2))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {sel ? (
                  <input
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    onBlur={commitNote}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    maxLength={500}
                    placeholder="Add a note for this day…"
                    className="gtd-input text-[13px]"
                  />
                ) : (
                  <p className="text-[12px] text-text-3">{selFuture ? "Can't log a future day." : 'Set a state above to add a note.'}</p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>,
    document.body
  );
}
