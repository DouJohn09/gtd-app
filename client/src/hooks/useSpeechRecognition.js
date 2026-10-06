import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const speechSupported = !!SpeechRecognition;

export function useSpeechRecognition({ onResult, lang } = {}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => () => {
    recRef.current?.abort();
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.lang = lang || navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || '';
      if (transcript) onResult?.(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      if (e.error !== 'aborted') console.warn('[speech]', e.error);
      setListening(false);
    };

    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, lang, onResult]);

  return { listening, toggle, supported: speechSupported };
}
