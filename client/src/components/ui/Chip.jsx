const TONES = {
  neutral: { bg: 'rgba(255,255,255,0.025)', border: 'rgba(255,255,255,0.08)', text: 'rgb(var(--text-2))' },
  violet:  { bg: 'rgba(167,139,250,0.10)',   border: 'rgba(167,139,250,0.22)', text: 'rgb(var(--violet-glow))' },
  mint:    { bg: 'rgba(94,234,212,0.10)',    border: 'rgba(94,234,212,0.22)',  text: 'rgb(var(--mint-glow))' },
  amber:   { bg: 'rgba(251,191,36,0.10)',    border: 'rgba(251,191,36,0.22)',  text: 'rgb(var(--amber-glow))' },
  rose:    { bg: 'rgba(251,113,133,0.10)',   border: 'rgba(251,113,133,0.22)', text: 'rgb(var(--rose-glow))' },
};

export default function Chip({ tone = 'neutral', dot = false, className = '', children, ...rest }) {
  const c = TONES[tone] || TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono ${className}`}
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
      {...rest}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />}
      {children}
    </span>
  );
}
