import { useState, useEffect } from 'react';
import { X, Palmtree } from 'lucide-react';
import { api } from '../lib/api';

const todayStr = () => new Date().toISOString().split('T')[0];
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Mark a span of days as rest for all build habits — protects streaks while you're
// away or unwell. Rendered at page level (not inside a card), so no portal needed.
export default function RestDaysModal({ onClose, onDone }) {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(addDays(todayStr(), 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const valid = from && to && from <= to;

  const run = async (mode) => {
    if (!valid || busy) { if (!valid) setError('Pick a start date on or before the end date.'); return; }
    setBusy(true); setError('');
    try {
      if (mode === 'set') {
        await api.habits.setRestDays(from, to);
        onDone(`Rest days set ${from} → ${to}`);
      } else {
        await api.habits.clearRestDays(from, to);
        onDone(`Rest days cleared ${from} → ${to}`);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md my-6 rounded-2xl glass overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--mint) / 0.16)' }}
      >
        <div className="flex items-start justify-between p-5 border-b border-white/[0.05]">
          <div>
            <div className="mono-label" style={{ color: 'rgb(var(--mint-glow))' }}>rest_days</div>
            <h2 className="font-display text-[24px] leading-tight mt-0.5 inline-flex items-center gap-2">
              <Palmtree className="w-5 h-5" style={{ color: 'rgb(var(--mint-glow))' }} /> Rest days
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[13px] text-text-2 leading-relaxed">
            Away or taking a break? Mark a range as rest days and your <strong>build habits</strong> won't
            break their streaks or lose completion over that time. Days you've already logged are left as-is.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="gtd-label">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="gtd-input" />
            </div>
            <div>
              <label className="gtd-label">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="gtd-input" />
            </div>
          </div>

          {error && <p className="text-[12px]" style={{ color: 'rgb(var(--rose-glow))' }}>{error}</p>}

          <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={() => run('clear')}
              disabled={busy}
              className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px] disabled:opacity-50"
            >
              Clear range
            </button>
            <button
              type="button"
              onClick={() => run('set')}
              disabled={busy || !valid}
              className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Mark as rest'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
