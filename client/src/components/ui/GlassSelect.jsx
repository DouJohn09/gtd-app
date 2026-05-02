import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

export default function GlassSelect({ value, onChange, options, placeholder = 'Select…', onAdd, addLabel, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  const current = options.find(o => o.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="gtd-input w-full flex items-center justify-between gap-2 text-left"
      >
        <span
          className="font-mono text-[12px] truncate"
          style={{ color: current ? 'rgb(var(--text-1))' : 'rgb(var(--text-3))' }}
        >
          {current?.label || placeholder}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: 'rgb(var(--text-3))', transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-[240px] overflow-y-auto rounded-xl"
          style={{
            background: 'rgba(18, 18, 28, 0.92)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          <div className="py-1.5">
            {options.map(opt => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span
                    className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
                    style={{ color: active ? 'rgb(var(--violet-glow))' : 'transparent' }}
                  >
                    {active && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  </span>
                  <span
                    className="font-mono text-[11px] tracking-wide"
                    style={{ color: active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
            {onAdd && (
              <button
                type="button"
                onClick={() => { setOpen(false); onAdd(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] border-t border-white/[0.05]"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--mint-glow))' }} />
                <span className="font-mono text-[11px] tracking-wide" style={{ color: 'rgb(var(--mint-glow))' }}>
                  {addLabel || 'Add new…'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
