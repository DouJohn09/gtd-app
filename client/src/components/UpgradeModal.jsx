import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { setLimitHandler } from '../lib/api';

const UpgradeContext = createContext(null);

// Friendly copy per gated resource (matches server FREE_LIMITS).
const RESOURCE = {
  projects:     { noun: 'projects',     line: 'Organize every outcome without a ceiling.' },
  custom_lists: { noun: 'custom lists',  line: 'Keep as many reference lists as you like.' },
  habits:       { noun: 'habits',        line: 'Track every habit, not just three.' },
};

export function UpgradeProvider({ children }) {
  const [gate, setGate] = useState(null); // { resource, limit } | null
  const navigate = useNavigate();

  const showUpgrade = useCallback((info) => setGate(info || {}), []);
  const close = useCallback(() => setGate(null), []);

  // Route any 402 limit_reached from the API layer to this modal.
  useEffect(() => {
    setLimitHandler(showUpgrade);
    return () => setLimitHandler(null);
  }, [showUpgrade]);

  useEffect(() => {
    if (!gate) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gate, close]);

  const meta = gate ? (RESOURCE[gate.resource] || { noun: gate.resource || 'items', line: 'Unlock the full app.' }) : null;

  return (
    <UpgradeContext.Provider value={{ showUpgrade }}>
      {children}
      {gate && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Upgrade to Pro"
        >
          <div
            className="w-full max-w-sm rounded-2xl glass p-6 relative"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.20)' }}
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="w-11 h-11 rounded-xl grid place-items-center mb-4"
              style={{ background: 'rgb(var(--violet) / 0.12)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.28)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'rgb(var(--violet-glow))' }} />
            </div>

            <h3 className="font-display text-[20px] leading-tight mb-1">You've hit the Free plan limit</h3>
            <p className="text-[13px] text-text-2 leading-relaxed mb-4">
              {gate.limit != null
                ? <>Free includes up to <span className="text-text-1 font-medium">{gate.limit} {meta.noun}</span>. {meta.line}</>
                : <>You've reached a Free plan limit. {meta.line}</>}
            </p>

            <ul className="text-[12.5px] text-text-2 space-y-1.5 mb-5">
              <li>· Unlimited projects, lists &amp; habits</li>
              <li>· Productivity analytics dashboard</li>
              <li>· A much higher daily AI cap</li>
            </ul>

            <div className="flex gap-2">
              <button onClick={close} className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]">Maybe later</button>
              <button
                onClick={() => { close(); navigate('/settings'); }}
                className="flex-1 py-2.5 rounded-xl text-[12.5px] font-medium transition-all"
                style={{ background: 'rgb(var(--violet) / 0.18)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.34)' }}
              >
                See Pro plans →
              </button>
            </div>
          </div>
        </div>
      )}
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  const ctx = useContext(UpgradeContext);
  if (!ctx) throw new Error('useUpgrade must be used within UpgradeProvider');
  return ctx;
}
