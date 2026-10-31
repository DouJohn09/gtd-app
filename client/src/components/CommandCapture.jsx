import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import QuickCapture from './QuickCapture';

const PHONE = '(max-width: 767px)';

// Phones get a bottom sheet. Mobile browsers mostly lay the on-screen
// keyboard over the page instead of shrinking it, which would hide a sheet
// pinned to the bottom, so we lift the sheet by the part of the screen the
// keyboard covers (visualViewport).
function useKeyboardInset(active) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}

export default function CommandCapture({ open, voice = false, onClose }) {
  const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches);
  const keyboard = useKeyboardInset(open && phone);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const startListening = voice === 'hold' ? 'hold' : !!voice;

  if (phone) {
    return (
      <div data-modal className="fixed inset-0 z-[100] flex items-end">
        <div
          className="absolute inset-0 backdrop-blur-md"
          style={{ background: 'rgba(8,8,14,0.55)' }}
          onClick={onClose}
        />
        <div
          className="relative w-full glass shadow-glass-lg rounded-t-3xl px-4 pt-3 animate-rise"
          style={{
            marginBottom: keyboard,
            paddingBottom: keyboard ? 14 : 'calc(18px + env(safe-area-inset-bottom))',
          }}
        >
          <div className="mx-auto mb-3 w-10 h-1 rounded-full bg-white/15" aria-hidden="true" />
          <div className="flex items-center justify-between mb-3">
            <div className="mono-label">add a task</div>
            <button onClick={onClose} aria-label="Close" className="tap-expand grid place-items-center w-8 h-8 rounded-lg border border-white/10 hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Stays open after each send, like the desktop popup, so several
              thoughts can go in one after another. */}
          <QuickCapture variant="sheet" autoFocus={!startListening} startListening={startListening} />
        </div>
      </div>
    );
  }

  return (
    <div data-modal className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] sm:pt-[18vh] px-4">
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'rgba(8,8,14,0.55)' }}
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl rounded-3xl glass shadow-glass-lg p-4 sm:p-6 animate-rise">
        <div className="flex items-center justify-between mb-4">
          <div className="mono-label">quick capture</div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-2">esc</span>
            <button onClick={onClose} className="tap-expand grid place-items-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {/* No onCapture — the popup stays open so the user can fire multiple
            captures in a row. AI runs in the background per capture; the
            modal is dismissed explicitly via Esc, the X, or click-outside.
            Binding it to AI-completion (as before) yanked the modal away
            mid-typing when the prior capture's AI finished. */}
        <QuickCapture autoFocus startListening={startListening} />
        <div className="mt-4 font-mono text-[11px] text-text-3">
          tip · keep typing to capture more<span className="hidden sm:inline"> · <span className="text-text-2">esc</span> when done</span>
        </div>
      </div>
    </div>
  );
}
