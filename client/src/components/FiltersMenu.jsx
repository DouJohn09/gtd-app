import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Check, EyeOff } from 'lucide-react';

function OptionRow({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span
        className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
        style={{ color: selected ? 'rgb(var(--violet-glow))' : 'transparent' }}
      >
        {selected && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
      </span>
      <span
        className="font-mono text-[11px] tracking-wide [overflow-wrap:anywhere]"
        style={{ color: selected ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
      >
        {children}
      </span>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="px-3 pt-1 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-3">
      {children}
    </div>
  );
}

/**
 * Single trigger that collapses Hide-overdue + Context + Project into one
 * popover, so the focus toolbar stays compact (especially on mobile). Shows a
 * count badge for how many filters are active. Anchored absolute dropdown
 * (same pattern as FilterDropdown/SortDropdown) — no fixed positioning, so it
 * is safe inside a .glass card.
 */
export default function FiltersMenu({
  contexts, projects,
  context, project, onContext, onProject,
  hideOverdue, onToggleOverdue, overdueCount,
}) {
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

  const showOverdue = overdueCount > 0 || hideOverdue;
  const activeCount = (context ? 1 : 0) + (project ? 1 : 0) + (hideOverdue ? 1 : 0);
  const active = activeCount > 0;

  // Nothing to filter by and no overdue toggle to offer → don't render at all.
  if (!contexts.length && !projects.length && !showOverdue) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl glass px-2.5 py-1.5 transition-colors hover:bg-white/[0.06]"
        style={active ? {
          background: 'rgb(var(--violet) / 0.12)',
          boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)',
        } : undefined}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-3))' }} />
        <span
          className="font-mono text-[11px] uppercase tracking-wider"
          style={{ color: active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
        >
          Filters
        </span>
        {active && (
          <span
            className="grid place-items-center min-w-[16px] h-4 px-1 rounded-full font-mono text-[10px] leading-none"
            style={{ background: 'rgb(var(--violet) / 0.28)', color: 'rgb(var(--violet-glow))' }}
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 w-[min(280px,calc(100vw-3rem))] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl"
          style={{
            background: 'rgba(18, 18, 28, 0.92)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          {showOverdue && (
            <div className="py-1.5 border-b border-white/[0.06]">
              <SectionLabel>Overdue</SectionLabel>
              <button
                type="button"
                onClick={onToggleOverdue}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span
                  className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
                  style={{ color: hideOverdue ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-3))' }}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </span>
                <span
                  className="font-mono text-[11px] tracking-wide"
                  style={{ color: hideOverdue ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
                >
                  {hideOverdue ? `Overdue hidden (${overdueCount})` : 'Hide overdue tasks'}
                </span>
              </button>
            </div>
          )}

          {contexts.length > 0 && (
            <div className="py-1.5 border-b border-white/[0.06]">
              <SectionLabel>Context</SectionLabel>
              <OptionRow selected={!context} onClick={() => onContext('')}>All</OptionRow>
              {contexts.map(c => (
                <OptionRow key={c} selected={c === context} onClick={() => onContext(c)}>{c}</OptionRow>
              ))}
            </div>
          )}

          {projects.length > 0 && (
            <div className="py-1.5">
              <SectionLabel>Project</SectionLabel>
              <OptionRow selected={!project} onClick={() => onProject('')}>All</OptionRow>
              {projects.map(p => (
                <OptionRow key={p} selected={p === project} onClick={() => onProject(p)}>{p}</OptionRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
