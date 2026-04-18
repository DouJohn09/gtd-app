import { Check } from 'lucide-react';

export default function FreshCheck({ checked = false, onChange, size = 22, className = '', ...rest }) {
  const baseStyle = {
    width: size, height: size,
    borderRadius: 8,
    border: '1.5px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.02)',
    transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
  };
  const onStyle = checked ? {
    background: 'linear-gradient(180deg, #5eead4 0%, #14b8a6 100%)',
    border: '1.5px solid transparent',
    boxShadow: '0 0 24px -6px rgba(94,234,212,0.55), inset 0 1px 0 0 rgba(255,255,255,0.3)',
  } : {};

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
      className={`fresh-check grid place-items-center shrink-0 ${className}`}
      style={{ ...baseStyle, ...onStyle }}
      aria-pressed={checked}
      {...rest}
    >
      {checked && <Check style={{ width: size * 0.55, height: size * 0.55, color: '#0a0a0f' }} strokeWidth={3} />}
    </button>
  );
}
