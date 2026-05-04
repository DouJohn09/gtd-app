import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ title = 'Are you sure?', message, confirmLabel = 'Delete', tone = 'rose', onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl glass p-6"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: `0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--${tone}) / 0.16)` }}
      >
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0"
            style={{ background: `rgb(var(--${tone}) / 0.10)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.25)` }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: `rgb(var(--${tone}-glow))` }} />
          </div>
          <div>
            <h3 className="font-display text-[18px] leading-tight">{title}</h3>
            {message && <p className="text-[13px] text-text-2 mt-1">{message}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]">Cancel</button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[12.5px] font-medium transition-all"
            style={{ background: `rgb(var(--${tone}) / 0.16)`, color: `rgb(var(--${tone}-glow))`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.32)` }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
