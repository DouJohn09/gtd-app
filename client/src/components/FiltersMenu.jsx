import { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Check, X } from 'lucide-react';

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

const PANEL_STYLE = {
  background: 'rgba(18, 18, 28, 0.92)',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 16px 48px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
};

/**
 * Config-driven filter popover. Collapses any number of boolean `toggles`
 * (e.g. Hide-overdue, Show-deferred) and single-select `filters` (Context,
 * Project, …) behind one trigger with an active-count badge, keeping toolbars
 * compact on mobile. Pair with <ActiveFilters> (same arrays) to render the
 * applied filters as removable chips.
 *
 * toggles: [{ key, label, active, onToggle, activeLabel?, icon?, show? }]
 * filters: [{ key, label, options, value, onChange, renderValue? }]
 *
 * Anchored absolute dropdown (no fixed positioning) so it is safe inside a
 * .glass card.
 */
export default function FiltersMenu({ toggles = [], filters = [] }) {
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

  const visibleToggles = toggles.filter(t => t.show !== false);
  const usableFilters = filters.filter(f => f.options && f.options.length > 0);
  if (!visibleToggles.length && !usableFilters.length) return null;

  const activeCount =
    visibleToggles.filter(t => t.active).length +
    usableFilters.filter(f => f.value).length;
  const active = activeCount > 0;

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
          style={PANEL_STYLE}
        >
          {visibleToggles.length > 0 && (
            <div className="py-1.5 border-b border-white/[0.06]">
              <SectionLabel>Display</SectionLabel>
              {visibleToggles.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={t.onToggle}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span
                      className="w-3.5 h-3.5 flex-shrink-0 grid place-items-center"
                      style={{ color: t.active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-3))' }}
                    >
                      {Icon ? <Icon className="w-3.5 h-3.5" /> : (t.active && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />)}
                    </span>
                    <span
                      className="font-mono text-[11px] tracking-wide"
                      style={{ color: t.active ? 'rgb(var(--violet-glow))' : 'rgb(var(--text-2))' }}
                    >
                      {t.active ? (t.activeLabel || t.label) : t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {usableFilters.map((f, idx) => (
            <div key={f.key} className={`py-1.5 ${idx < usableFilters.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
              <SectionLabel>{f.label}</SectionLabel>
              <OptionRow selected={!f.value} onClick={() => f.onChange('')}>All</OptionRow>
              {f.options.map(opt => (
                <OptionRow key={opt} selected={opt === f.value} onClick={() => f.onChange(opt)}>{opt}</OptionRow>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActiveFilterChip({ label, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full text-[11px] font-mono"
      style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.22)', color: 'rgb(var(--violet-glow))' }}
    >
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="grid place-items-center w-4 h-4 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

/**
 * Removable chips for whatever is currently applied — driven by the SAME
 * toggles/filters arrays passed to <FiltersMenu>. Renders nothing when no
 * filter is active. Removing a chip clears that filter / flips that toggle.
 */
export function ActiveFilters({ toggles = [], filters = [], className = '' }) {
  const chips = [];
  toggles
    .filter(t => t.show !== false && t.active)
    .forEach(t => chips.push({ key: `t-${t.key}`, label: t.activeLabel || t.label, onRemove: t.onToggle }));
  filters
    .filter(f => f.value)
    .forEach(f => chips.push({ key: `f-${f.key}`, label: f.renderValue ? f.renderValue(f.value) : f.value, onRemove: () => f.onChange('') }));

  if (!chips.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {chips.map(c => <ActiveFilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
    </div>
  );
}
