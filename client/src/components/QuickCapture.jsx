import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
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
  if (ai.project_name) parts.push(ai.project_name);
  if (ai.is_daily_focus) parts.push('Today');
  return `Added to ${parts.join(' · ')}`;
}

function formatBookedToast(bookedSlot) {
  const d = new Date(bookedSlot.date + 'T00:00:00');
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const [h, m] = bookedSlot.time.split(':').map(Number);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeLabel = m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
  return `Booked ${dayLabel} at ${timeLabel} (${bookedSlot.duration}m)`;
}

export default function QuickCapture({ onCapture, placeholder = "Quick capture — what's on your mind?", autoFocus = false }) {
  const [title, setTitle] = useState('');
  const [smartMode, setSmartMode] = useState(true);
  const { addToast } = useToast();

  // Fire-and-forget capture: clear the input the moment the user submits so
  // they can keep typing the next idea while the AI classifies in the
  // background. The toast lands when classification finishes; on failure we
  // echo the original text so the user knows what to retype.
  const handleSubmit = (e) => {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle('');

    (async () => {
      try {
        if (smartMode) {
          const routing = localStorage.getItem('smart_capture_routing') || 'auto_route';
          const { ai, fallback, bookedSlot, slotSearchFailed, routedToInbox } = await api.ai.smartCapture(text, routing);
          if (fallback || !ai) addToast('Captured to inbox (AI unavailable)', 'info');
          else if (bookedSlot) addToast(formatBookedToast(bookedSlot), 'success');
          else if (slotSearchFailed) addToast('No free slot found — captured without booking', 'info');
          else if (routedToInbox && routing === 'always_inbox') addToast(formatAiToast(ai), 'success');
          else if (routedToInbox) addToast(`Added to Inbox · AI wasn't sure where`, 'info');
          else addToast(formatAiToast(ai), 'success');
        } else {
          await api.tasks.create({ title: text });
          addToast('Captured to inbox', 'success');
        }
        window.dispatchEvent(new Event('task-captured'));
        onCapture?.();
      } catch (error) {
        console.error('Failed to capture:', error);
        const snippet = text.length > 40 ? text.slice(0, 40) + '…' : text;
        addToast(`Failed to capture "${snippet}"`, 'error');
      }
    })();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={smartMode ? '"call mom tomorrow" · "buy groceries Friday"' : placeholder}
          className="gtd-input w-full pl-10 pr-3"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setSmartMode(!smartMode)}
          className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-lg transition-all"
          style={
            smartMode
              ? { color: 'rgb(var(--violet-glow))', background: 'rgb(var(--violet) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.22)' }
              : { color: 'rgb(var(--text-3))' }
          }
          title={smartMode ? 'Smart Capture on — click to disable' : 'Smart Capture off — click to enable'}
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        type="submit"
        disabled={!title.trim()}
        className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
      >
        Capture
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}
