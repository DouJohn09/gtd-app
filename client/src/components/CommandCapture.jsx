import { useEffect } from 'react';
import { X } from 'lucide-react';
import QuickCapture from './QuickCapture';

export default function CommandCapture({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] px-4">
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'rgba(8,8,14,0.55)' }}
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-3xl glass shadow-glass-lg p-6 animate-rise">
        <div className="flex items-center justify-between mb-4">
          <div className="mono-label">quick capture</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-2">esc</span>
            <button onClick={onClose} className="grid place-items-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <QuickCapture onCapture={onClose} />
        <div className="mt-4 font-mono text-[11px] text-text-3">
          tip · try <span className="text-text-2">"draft brief tomorrow at 2pm"</span>, <span className="text-text-2">"call sam friday"</span>, <span className="text-text-2">"buy groceries"</span>
        </div>
      </div>
    </div>
  );
}
