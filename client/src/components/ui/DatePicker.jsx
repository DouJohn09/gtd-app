import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso) {
  if (!iso) return '';
  const d = parseDate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function DatePicker({ value, onChange, placeholder = 'No date', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = parseDate(value);
  const [viewYear, setViewYear] = useState(() => selected?.getFullYear() || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selected?.getMonth() || new Date().getMonth());

  useEffect(() => {
    if (open && value) {
      const d = parseDate(value);
      if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    let startDow = first.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const todayISO = toISO(new Date());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDay = (day) => {
    const iso = toISO(new Date(viewYear, viewMonth, day));
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="gtd-input w-full flex items-center justify-between gap-2 text-left"
      >
        <span
          className="font-mono text-[12px] truncate"
          style={{ color: value ? 'rgb(var(--text-1))' : 'rgb(var(--text-3))' }}
        >
          {formatDisplay(value) || placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span
              className="grid place-items-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
            >
              <X className="w-3 h-3" style={{ color: 'rgb(var(--text-3))' }} />
            </span>
          )}
          <Calendar className="w-3.5 h-3.5" style={{ color: 'rgb(var(--text-3))' }} />
        </div>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl p-3 w-[280px]"
          style={{
            background: 'rgba(18, 18, 28, 0.95)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="grid place-items-center w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-colors">
              <ChevronLeft className="w-4 h-4 text-text-2" />
            </button>
            <span className="font-mono text-[12px] text-text-1 tracking-wide">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="grid place-items-center w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-colors">
              <ChevronRight className="w-4 h-4 text-text-2" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="font-mono text-[9px] text-text-3 text-center py-1 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} />;
              const iso = toISO(new Date(viewYear, viewMonth, day));
              const isSelected = iso === value;
              const isToday = iso === todayISO;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className="w-full aspect-square rounded-lg font-mono text-[11px] transition-all grid place-items-center"
                  style={
                    isSelected
                      ? { background: 'rgb(var(--violet) / 0.35)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.5)' }
                      : isToday
                        ? { color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.3)' }
                        : { color: 'rgb(var(--text-2))' }
                  }
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '';
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="font-mono text-[10px] text-text-3 hover:text-text-1 transition-colors px-2 py-1"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { onChange(todayISO); setOpen(false); }}
              className="font-mono text-[10px] px-2 py-1 rounded-md transition-colors"
              style={{ color: 'rgb(var(--mint-glow))' }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
