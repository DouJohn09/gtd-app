import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none max-w-[calc(100vw-3rem)]">
      <div
        className="pointer-events-auto inline-flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-2xl glass animate-slide-in"
        style={{
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.25)',
        }}
      >
        <div
          className="grid place-items-center w-7 h-7 rounded-xl flex-shrink-0"
          style={{ background: 'rgb(var(--violet) / 0.14)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.30)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: 'rgb(var(--violet-glow))' }} />
        </div>
        <span className="text-[13px] text-text-1 leading-snug">New version available</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors"
          style={{ background: 'rgb(var(--violet) / 0.18)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.32)' }}
        >
          Reload
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="grid place-items-center w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
