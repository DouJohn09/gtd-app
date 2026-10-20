import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import MonoLabel from './ui/MonoLabel';

// The "?" panel: every keyboard shortcut in one place. Keep in sync with
// Layout (global + g-navigation), useTaskListKeys, Calendar, Dashboard and
// TaskModal.
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS = [
  {
    label: 'anywhere',
    rows: [
      [[MOD, 'K'], 'Capture'],
      [[MOD, '⇧', 'K'], 'Capture by voice'],
      [['?'], 'This list'],
    ],
  },
  {
    label: 'go to',
    rows: [
      [['g', 't'], 'Today'],
      [['g', 'i'], 'Inbox'],
      [['g', 'c'], 'Calendar'],
      [['g', 'p'], 'Projects'],
      [['g', 'n'], 'Next Actions'],
      [['g', 'w'], 'Waiting For'],
      [['g', 'r'], 'Review & Planning'],
      [['g', 'h'], 'Habits'],
    ],
  },
  {
    label: 'inbox & lists',
    rows: [
      [['j', 'k'], 'Select next / previous'],
      [['↵'], 'Open the task'],
      [['x'], 'Done'],
      [['f'], 'Star for Today'],
      [['⌫'], 'Delete'],
      [['n', 'w', 's'], 'Inbox: to Next / Waiting / Someday'],
    ],
  },
  {
    label: 'calendar',
    rows: [
      [['←', '→'], 'Previous / next'],
      [['t'], 'Today'],
      [['m', 'w', 'd'], 'Month / week / day'],
      [['p'], 'Plan my week'],
    ],
  },
  {
    label: 'today & tasks',
    rows: [
      [['p'], 'Plan my day'],
      [[MOD, '↵'], 'Save the open task'],
      [['esc'], 'Close'],
    ],
  },
];

export default function ShortcutsHelp({ onClose }) {
  useEffect(() => {
    // Escape only: the "?" that opened this is still dispatching and would
    // reach a listener added here, closing the panel at once.
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose} style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}>
      <div
        className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto overflow-x-hidden scrollbar-thin rounded-2xl glass p-6"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-[26px] leading-none">Keyboard shortcuts</h2>
          <button onClick={onClose} className="tap-expand grid place-items-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/5" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {GROUPS.map(g => (
            <div key={g.label}>
              <MonoLabel className="mb-2">{g.label}</MonoLabel>
              <div className="grid gap-1.5">
                {g.rows.map(([keys, what]) => (
                  <div key={what} className="flex items-center justify-between gap-3 text-[13px] text-text-2">
                    <span>{what}</span>
                    <span className="flex gap-1 flex-shrink-0">{keys.map(k => <kbd key={k} className="kbd">{k}</kbd>)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[11.5px] text-text-3">Shortcuts pause while you’re typing in a field.</p>
      </div>
    </div>,
    document.body
  );
}
