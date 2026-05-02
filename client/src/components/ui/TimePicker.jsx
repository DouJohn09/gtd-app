import { useState, useRef, useEffect } from 'react';
import { Clock, X } from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function formatDisplay(val) {
  if (!val) return '';
  const [h, m] = val.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export default function TimePicker({ value, onChange, placeholder = 'No time', disabled, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  const [h, m] = value ? value.split(':') : ['', ''];

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

  useEffect(() => {
    if (open && h && hourRef.current) {
      const idx = HOURS.indexOf(h);
      if (idx >= 0) hourRef.current.scrollTop = idx * 32 - 48;
    }
    if (open && m && minuteRef.current) {
      const idx = MINUTES.indexOf(m);
      if (idx >= 0) minuteRef.current.scrollTop = idx * 32 - 48;
    }
  }, [open]);

  const selectHour = (hour) => {
    const min = m || '00';
    onChange(`${hour}:${min}`);
  };

  const selectMinute = (minute) => {
    const hour = h || '09';
    onChange(`${hour}:${minute}`);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className="gtd-input w-full flex items-center justify-between gap-2 text-left"
        style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      >
        <span
          className="font-mono text-[12px] truncate"
          style={{ color: value ? 'rgb(var(--text-1))' : 'rgb(var(--text-3))' }}
        >
          {formatDisplay(value) || placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && !disabled && (
            <span
              className="grid place-items-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
            >
              <X className="w-3 h-3" style={{ color: 'rgb(var(--text-3))' }} />
            </span>
          )}
          <Clock className="w-3.5 h-3.5" style={{ color: 'rgb(var(--text-3))' }} />
        </div>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(18, 18, 28, 0.95)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex">
            <div className="w-16 border-r border-white/[0.05]">
              <div className="font-mono text-[9px] text-text-3 uppercase tracking-wider text-center py-1.5 border-b border-white/[0.05]">
                Hr
              </div>
              <div ref={hourRef} className="h-[192px] overflow-y-auto scrollbar-thin">
                {HOURS.map(hour => {
                  const active = hour === h;
                  return (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => selectHour(hour)}
                      className="w-full h-8 font-mono text-[12px] transition-colors hover:bg-white/[0.06] grid place-items-center"
                      style={active ? { background: 'rgb(var(--violet) / 0.25)', color: 'rgb(var(--violet-glow))' } : { color: 'rgb(var(--text-2))' }}
                    >
                      {hour}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-16">
              <div className="font-mono text-[9px] text-text-3 uppercase tracking-wider text-center py-1.5 border-b border-white/[0.05]">
                Min
              </div>
              <div ref={minuteRef} className="h-[192px] overflow-y-auto scrollbar-thin">
                {MINUTES.map(minute => {
                  const active = minute === m;
                  return (
                    <button
                      key={minute}
                      type="button"
                      onClick={() => selectMinute(minute)}
                      className="w-full h-8 font-mono text-[12px] transition-colors hover:bg-white/[0.06] grid place-items-center"
                      style={active ? { background: 'rgb(var(--violet) / 0.25)', color: 'rgb(var(--violet-glow))' } : { color: 'rgb(var(--text-2))' }}
                    >
                      {minute}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] px-3 py-1.5 flex justify-between">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="font-mono text-[10px] text-text-3 hover:text-text-1 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[10px] transition-colors"
              style={{ color: 'rgb(var(--violet-glow))' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
