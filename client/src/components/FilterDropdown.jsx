import { useState, useRef, useEffect } from 'react';
import { Filter, Check } from 'lucide-react';

export function useTaskFilters(tasks) {
  const contexts = [...new Set(tasks.map(t => t.context).filter(Boolean))].sort();
  const projects = [...new Set(tasks.map(t => t.project_name).filter(Boolean))].sort();
  return { contexts, projects };
}

export function applyFilters(tasks, { context, project }) {
  let result = tasks;
  if (context) result = result.filter(t => t.context === context);
  if (project) result = result.filter(t => t.project_name === project);
  return result;
}

export default function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!options.length) return null;

  const active = !!value;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-xl glass px-2.5 py-1.5 transition-colors hover:bg-white/[0.06]"
        style={active ? {
          background: 'rgb(var(--violet) / 0.12)',
          boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)',
        } : undefined}
      >
        <Filter className="w-3.5 h-3.5" style={{ color: active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-3))' }} />
        <span
          className="font-mono text-[11px] uppercase tracking-wider"
          style={{ color: active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
        >
          {value || label}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] max-h-[280px] overflow-y-auto rounded-xl"
          style={{
            background: 'rgba(18, 18, 28, 0.92)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          <div className="py-1.5">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span
                className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
                style={{ color: !value ? 'rgb(var(--violet-glow))' : 'transparent' }}
              >
                {!value && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
              </span>
              <span
                className="font-mono text-[11px] tracking-wide"
                style={{ color: !value ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
              >
                All
              </span>
            </button>
            {options.map(opt => {
              const isActive = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span
                    className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
                    style={{ color: isActive ? 'rgb(var(--violet-glow))' : 'transparent' }}
                  >
                    {isActive && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  </span>
                  <span
                    className="font-mono text-[11px] tracking-wide"
                    style={{ color: isActive ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
                  >
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
