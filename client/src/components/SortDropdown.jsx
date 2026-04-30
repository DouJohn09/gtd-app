import { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'priority',           label: 'Priority' },
  { value: 'date_added_newest',  label: 'Date added (newest)' },
  { value: 'date_added_oldest',  label: 'Date added (oldest)' },
  { value: 'due_date',           label: 'Due date (soonest)' },
  { value: 'energy_low',         label: 'Energy (low first)' },
  { value: 'energy_high',        label: 'Energy (high first)' },
  { value: 'time_shortest',      label: 'Quick wins (shortest)' },
  { value: 'time_longest',       label: 'Time (longest first)' },
  { value: 'alphabetical',       label: 'Alphabetical' },
];

const COMPLETED_SORT_OPTIONS = [
  { value: 'completed_newest',   label: 'Completed (newest)' },
  { value: 'completed_oldest',   label: 'Completed (oldest)' },
  { value: 'priority',           label: 'Priority' },
  { value: 'alphabetical',       label: 'Alphabetical' },
];

const energyOrder = { high: 3, medium: 2, low: 1 };

export function sortTasks(tasks, sortBy) {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return (b.priority || 0) - (a.priority || 0);
      case 'date_added_newest':
        return (b.created_at || '').localeCompare(a.created_at || '');
      case 'date_added_oldest':
        return (a.created_at || '').localeCompare(b.created_at || '');
      case 'due_date': {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case 'energy_low':
        return (energyOrder[a.energy_level] || 0) - (energyOrder[b.energy_level] || 0);
      case 'energy_high':
        return (energyOrder[b.energy_level] || 0) - (energyOrder[a.energy_level] || 0);
      case 'time_shortest': {
        if (!a.time_estimate && !b.time_estimate) return 0;
        if (!a.time_estimate) return 1;
        if (!b.time_estimate) return -1;
        return a.time_estimate - b.time_estimate;
      }
      case 'time_longest': {
        if (!a.time_estimate && !b.time_estimate) return 0;
        if (!a.time_estimate) return 1;
        if (!b.time_estimate) return -1;
        return b.time_estimate - a.time_estimate;
      }
      case 'alphabetical':
        return (a.title || '').localeCompare(b.title || '');
      case 'completed_newest':
        return (b.completed_at || '').localeCompare(a.completed_at || '');
      case 'completed_oldest':
        return (a.completed_at || '').localeCompare(b.completed_at || '');
      default:
        return 0;
    }
  });
}

export default function SortDropdown({ value, onChange, completed = false }) {
  const options = completed ? COMPLETED_SORT_OPTIONS : SORT_OPTIONS;
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

  const current = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-xl glass px-2.5 py-1.5 transition-colors hover:bg-white/[0.06]"
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-text-3" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-2">
          {current?.label || 'Sort'}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-xl overflow-hidden"
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
          </div>
        </div>
      )}
    </div>
  );
}
