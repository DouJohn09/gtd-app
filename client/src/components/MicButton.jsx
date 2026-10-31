import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';
import { speechSupported } from '../hooks/useSpeechRecognition';

// Mic with two ways to use it: press and hold to talk (stops on release), or
// a quick tap to start and another tap to stop. Also answers the global
// "hold Option" gesture (Layout) when `fieldRef` is the focused field.
const HOLD_MS = 300;

export default function MicButton({ speech, fieldRef, size = 'md', className = '' }) {
  const pressedAt = useRef(0);
  const holding = useRef(false);
  const optionHold = useRef(false);

  useEffect(() => {
    const onStart = (e) => {
      if (!fieldRef?.current || e.detail?.target !== fieldRef.current) return;
      optionHold.current = true;
      speech.start();
    };
    const onEnd = () => {
      if (!optionHold.current) return;
      optionHold.current = false;
      speech.stop();
    };
    window.addEventListener('dictate-hold-start', onStart);
    window.addEventListener('dictate-hold-end', onEnd);
    return () => {
      window.removeEventListener('dictate-hold-start', onStart);
      window.removeEventListener('dictate-hold-end', onEnd);
    };
  }, [speech, fieldRef]);

  if (!speechSupported) return null;

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); // keep focus (and the caret) in the field
    e.currentTarget.setPointerCapture?.(e.pointerId); // release counts even off the button
    pressedAt.current = Date.now();
    if (speech.listening) { speech.stop(); pressedAt.current = 0; return; }
    holding.current = true;
    speech.start();
  };
  const up = () => {
    if (!holding.current) return;
    holding.current = false;
    // Held: release ends it. Quick tap: keep listening until the next tap.
    if (Date.now() - pressedAt.current >= HOLD_MS) speech.stop();
  };

  const dim = size === 'sm' ? 'w-7 h-7 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-full' : 'w-9 h-9 rounded-lg';
  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      className={`tap-expand grid place-items-center ${dim} transition-all shrink-0 select-none touch-none ${className}`}
      style={
        speech.listening
          ? { color: '#ef4444', background: 'rgba(239,68,68,0.12)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)' }
          : size === 'lg'
            ? { color: 'rgb(var(--text-1))', background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }
            : { color: 'rgb(var(--text-3))' }
      }
      title={speech.listening ? 'Listening — release or tap to stop' : 'Hold to talk, or tap to start (or hold ⌥ Option)'}
      aria-label={speech.listening ? 'Stop dictation' : 'Dictate'}
    >
      <Mic className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
    </button>
  );
}

// Live preview of the phrase being spoken, under the field.
export function InterimLine({ speech }) {
  if (!speech.listening) return null;
  return (
    <div className="mt-1.5 text-[12px] text-text-3 italic min-h-[18px] truncate" aria-live="polite">
      {speech.interim || 'Listening…'}
    </div>
  );
}
