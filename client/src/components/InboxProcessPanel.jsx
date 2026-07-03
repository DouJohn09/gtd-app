import { Sparkles, Check, ArrowRight } from 'lucide-react';
import { contextLabel } from '../lib/context';
import { listLabel } from '../lib/listLabel';

/**
 * Inline preview of AI inbox-processing suggestions. Each row is keep/skip
 * (tap to toggle); nothing is written until "Apply". For per-field editing
 * (project, due date, energy…) the full editor still lives on /ai.
 */
export default function InboxProcessPanel({ result, kept, onToggleKept, onApply, onCancel, applying }) {
  const items = result?.processed_items || [];
  const tasks = result?.tasks || [];
  const keptCount = items.filter(it => kept.has(it.original_index)).length;

  return (
    <div className="rounded-2xl glass p-4" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'rgb(var(--violet-glow))' }}>
          <Sparkles className="w-3.5 h-3.5" /> AI suggestions · {items.length}
        </span>
        <button
          onClick={onCancel}
          className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors"
        >
          cancel
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => {
          const originalTitle = tasks[item.original_index - 1]?.title;
          const isKept = kept.has(item.original_index);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggleKept(item.original_index)}
              className="w-full text-left rounded-xl p-3 flex items-start gap-3 transition-all"
              style={{
                background: 'rgba(255,255,255,0.02)',
                boxShadow: `inset 0 0 0 1px ${isKept ? 'rgb(var(--violet) / 0.22)' : 'rgba(255,255,255,0.05)'}`,
                opacity: isKept ? 1 : 0.5,
              }}
            >
              <span
                className="mt-0.5 w-4 h-4 rounded-md grid place-items-center flex-shrink-0"
                style={{
                  background: isKept ? 'rgb(var(--violet) / 0.85)' : 'transparent',
                  boxShadow: isKept ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,0.2)',
                }}
              >
                {isKept && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] leading-snug [overflow-wrap:anywhere]">
                  {item.suggested_title || originalTitle}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <ArrowRight className="w-3 h-3 text-text-3" />
                  <span className={`gtd-badge list-${item.recommended_list}`}>
                    {listLabel(item.recommended_list)}
                  </span>
                  {item.context && <span className="context-badge">{contextLabel(item.context)}</span>}
                  {item.priority != null && <span className="font-mono text-[10.5px] text-text-3">p{item.priority}</span>}
                  {item.due_date && <span className="font-mono text-[10.5px] text-text-3">{item.due_date}</span>}
                </div>
                {item.reasoning && (
                  <p className="text-[11.5px] text-text-3 mt-1.5 leading-relaxed">{item.reasoning}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onApply}
          disabled={applying || keptCount === 0}
          className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50"
        >
          {applying ? 'Applying…' : `Apply ${keptCount}`}
        </button>
        <button onClick={onCancel} className="gtd-btn gtd-btn-secondary text-[12.5px]">
          Cancel
        </button>
      </div>
      <p className="font-mono text-[10px] text-text-3 mt-2 text-center">
        Tap a row to keep or skip · edit fields on the AI assistant
      </p>
    </div>
  );
}
