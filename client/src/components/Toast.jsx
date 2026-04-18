import { useState, createContext, useContext } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] space-y-2 pointer-events-none max-w-[calc(100vw-3rem)]">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

const TONE_BY_TYPE = {
  success: 'mint',
  error:   'rose',
  warning: 'amber',
  info:    'violet',
};

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertCircle,
  info:    Info,
};

function Toast({ toast, onClose }) {
  const tone = TONE_BY_TYPE[toast.type] || 'violet';
  const Icon = ICONS[toast.type] || Info;

  return (
    <div
      className="pointer-events-auto inline-flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-2xl glass animate-slide-in"
      style={{
        boxShadow: `0 12px 32px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--${tone}) / 0.25)`,
      }}
    >
      <div
        className="grid place-items-center w-7 h-7 rounded-xl flex-shrink-0"
        style={{ background: `rgb(var(--${tone}) / 0.14)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.30)` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: `rgb(var(--${tone}-glow))` }} />
      </div>
      <span className="text-[13px] text-text-1 leading-snug">{toast.message}</span>
      <button
        onClick={onClose}
        className="grid place-items-center w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
