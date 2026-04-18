export default function GlassCard({ as: Tag = 'div', className = '', hover = true, padded = true, children, ...rest }) {
  return (
    <Tag
      className={`rounded-2xl glass ${hover ? 'glass-hover' : ''} ${padded ? 'p-6' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
