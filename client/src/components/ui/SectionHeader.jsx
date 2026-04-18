import MonoLabel from './MonoLabel';

export default function SectionHeader({ eyebrow, title, action, className = '' }) {
  return (
    <div className={`flex items-end justify-between mb-6 ${className}`}>
      <div>
        {eyebrow && <MonoLabel className="mb-1.5">{eyebrow}</MonoLabel>}
        {title && <h2 className="font-display text-[28px] leading-none">{title}</h2>}
      </div>
      {action}
    </div>
  );
}
