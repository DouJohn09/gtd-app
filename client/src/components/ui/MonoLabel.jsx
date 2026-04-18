export default function MonoLabel({ as: Tag = 'div', tone, className = '', children, ...rest }) {
  const colorStyle = tone ? { color: `rgb(var(--${tone}-glow))` } : undefined;
  return (
    <Tag
      className={`font-mono text-[0.65rem] uppercase tracking-[0.22em] text-text-3 ${className}`}
      style={colorStyle}
      {...rest}
    >
      {children}
    </Tag>
  );
}
