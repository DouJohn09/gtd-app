import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const speechSupported = !!SpeechRecognition;

// Browser dictation (Web Speech API). Listens until stop() — pauses in speech
// don't end it: recognition runs continuously and, when the browser ends a
// session on its own (long silence, ~1 min cap), it is restarted for as long
// as the caller still wants to listen. Final phrases go to onResult; the
// phrase still being spoken is exposed as `interim` for a live preview.
export function useSpeechRecognition({ onResult, lang } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef(null);
  const wantRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.abort();
  }, []);

  const begin = useCallback(() => {
    const rec = new SpeechRecognition();
    rec.lang = lang || navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) { if (text.trim()) onResultRef.current?.(text.trim()); }
        else pending += text;
      }
      setInterim(pending.trim());
    };
    rec.onend = () => {
      if (wantRef.current) {
        try { begin(); return; } catch { /* fall through to stopped */ }
      }
      wantRef.current = false;
      setInterim('');
      setListening(false);
    };
    rec.onerror = (e) => {
      // Mic blocked or no device: restarting would loop, so give up.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') wantRef.current = false;
      if (e.error !== 'aborted' && e.error !== 'no-speech') console.warn('[speech]', e.error);
    };

    recRef.current = rec;
    rec.start();
  }, [lang]);

  const start = useCallback(() => {
    if (!SpeechRecognition || wantRef.current) return;
    wantRef.current = true;
    setListening(true);
    try { begin(); } catch { wantRef.current = false; setListening(false); }
  }, [begin]);

  // stop() lets the browser deliver the last phrase before onend fires.
  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  const toggle = useCallback(() => (wantRef.current ? stop() : start()), [start, stop]);

  return { listening, interim, start, stop, toggle, supported: speechSupported };
}
