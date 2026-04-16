import { useState } from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const LIST_LABELS = {
  inbox: 'Inbox',
  next_actions: 'Next Actions',
  waiting_for: 'Waiting For',
  someday_maybe: 'Someday/Maybe',
};

function formatAiToast(ai) {
  const parts = [LIST_LABELS[ai.list] || ai.list];
  if (ai.context) parts.push(ai.context);
  if (ai.due_date) {
    const d = new Date(ai.due_date + 'T00:00:00');
    parts.push('due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  if (ai.is_daily_focus) parts.push('Daily Focus');
  return `Added to ${parts.join(' · ')}`;
}

export default function QuickCapture({ onCapture, placeholder = "Quick capture - what's on your mind?" }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      if (smartMode) {
        const { ai, fallback } = await api.ai.smartCapture(title.trim());
        setTitle('');
        if (fallback || !ai) {
          addToast('Task captured to inbox (AI unavailable)', 'info');
        } else {
          addToast(formatAiToast(ai), 'success');
        }
      } else {
        await api.tasks.create({ title: title.trim() });
        setTitle('');
        addToast('Task captured to inbox', 'success');
      }
      onCapture?.();
    } catch (error) {
      console.error('Failed to capture:', error);
      addToast(error.message || 'Failed to capture task', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={smartMode ? 'e.g. "call mom tomorrow", "buy groceries Friday"' : placeholder}
          className="gtd-input w-full pr-9"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setSmartMode(!smartMode)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors
            ${smartMode
              ? 'text-yellow-500 hover:text-yellow-600'
              : 'text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400'
            }
          `}
          title={smartMode ? 'AI Smart Capture on — click to disable' : 'AI Smart Capture off — click to enable'}
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>
      <button
        type="submit"
        disabled={!title.trim() || loading}
        className="gtd-btn gtd-btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        {loading && smartMode ? 'AI...' : 'Capture'}
      </button>
    </form>
  );
}
