import { useState, useEffect } from 'react';
import { X, AlertCircle, Plus, Sparkles, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const LISTS = [
  { value: 'inbox',         label: 'Inbox',         tone: 'amber'  },
  { value: 'next_actions',  label: 'Next Actions',  tone: 'mint'   },
  { value: 'waiting_for',   label: 'Waiting For',   tone: 'rose'   },
  { value: 'someday_maybe', label: 'Someday/Maybe', tone: 'violet' },
];

const ENERGY_LEVELS = [
  { value: 'low',    label: 'low',    tone: 'mint'  },
  { value: 'medium', label: 'medium', tone: 'amber' },
  { value: 'high',   label: 'high',   tone: 'rose'  },
];

export default function TaskModal({ task, projects, onClose, onSave }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    title: '', notes: '', list: 'inbox', context: '', project_id: '',
    waiting_for_person: '', due_date: '', energy_level: '', time_estimate: '',
    is_daily_focus: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [contexts, setContexts] = useState([]);
  const [addingContext, setAddingContext] = useState(false);
  const [newContextName, setNewContextName] = useState('');

  useEffect(() => {
    api.contexts.getAll().then(setContexts).catch(console.error);
  }, []);

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        notes: task.notes || '',
        list: task.list || 'inbox',
        context: task.context || '',
        project_id: task.project_id || '',
        waiting_for_person: task.waiting_for_person || '',
        due_date: task.due_date || '',
        energy_level: task.energy_level || '',
        time_estimate: task.time_estimate || '',
        is_daily_focus: task.is_daily_focus === 1,
      });
    }
  }, [task]);

  // Esc to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleAddContext = async () => {
    if (!newContextName.trim()) return;
    try {
      const created = await api.contexts.create(newContextName);
      setContexts([...contexts, created]);
      setForm({ ...form, context: created.name });
      setNewContextName('');
      setAddingContext(false);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = {
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        list: form.list,
        context: form.context || null,
        project_id: form.project_id ? parseInt(form.project_id) : null,
        waiting_for_person: form.waiting_for_person.trim() || null,
        due_date: form.due_date || null,
        energy_level: form.energy_level || null,
        time_estimate: form.time_estimate ? parseInt(form.time_estimate) : null,
        is_daily_focus: form.is_daily_focus ? 1 : 0,
      };
      if (task?.id) {
        await api.tasks.update(task.id, data);
        addToast('Task updated', 'success');
      } else {
        await api.tasks.create(data);
        addToast('Task created', 'success');
      }
      onSave?.();
      onClose();
    } catch (err) {
      console.error('Failed to save task:', err);
      setError(err.message || 'Failed to save task. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg my-6 rounded-2xl glass overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(var(--violet) / 0.16)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <div>
            <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>
              {task?.id ? 'edit_task' : 'new_task'}
            </div>
            <h2 className="font-display text-[24px] leading-tight mt-0.5">
              {task?.id ? 'Edit Task' : 'New Task'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{ background: 'rgb(var(--rose) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.25)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--rose-glow))' }} />
              <p className="text-[12.5px] text-text-1">{error}</p>
            </div>
          )}

          <div>
            <label className="gtd-label">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="gtd-input"
              required
              autoFocus
              placeholder="What needs doing?"
            />
          </div>

          <div>
            <label className="gtd-label">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="gtd-input min-h-[80px] resize-none"
              placeholder="Anything else?"
            />
            <NotesLinks notes={form.notes} />
          </div>

          {/* List as segmented chips */}
          <div>
            <label className="gtd-label">List</label>
            <div className="flex flex-wrap gap-1.5">
              {LISTS.map(l => {
                const active = form.list === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setForm({ ...form, list: l.value })}
                    className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all"
                    style={
                      active
                        ? {
                            background: `rgb(var(--${l.tone}) / 0.16)`,
                            color: `rgb(var(--${l.tone}-glow))`,
                            boxShadow: `inset 0 0 0 1px rgb(var(--${l.tone}) / 0.32)`,
                          }
                        : {
                            color: 'rgb(var(--text-3))',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }
                    }
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            <p className="font-mono text-[10px] text-text-3 mt-1.5">
              inbox = unsorted &middot; next = do it &middot; waiting = delegated &middot; someday = later
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gtd-label">Context</label>
              {addingContext ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newContextName}
                    onChange={(e) => setNewContextName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddContext(); }
                      if (e.key === 'Escape') setAddingContext(false);
                    }}
                    className="gtd-input flex-1"
                    placeholder="@context"
                    autoFocus
                  />
                  <button type="button" onClick={handleAddContext} className="gtd-btn gtd-btn-primary px-2">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <select
                  value={form.context}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') setAddingContext(true);
                    else setForm({ ...form, context: e.target.value });
                  }}
                  className="gtd-input"
                >
                  <option value="">No context</option>
                  {contexts.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="__add_new__">+ Add new context…</option>
                </select>
              )}
            </div>

            <div>
              <label className="gtd-label">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="gtd-input"
              >
                <option value="">No project</option>
                {projects?.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {form.list === 'waiting_for' && (
            <div>
              <label className="gtd-label">Waiting on</label>
              <input
                type="text"
                value={form.waiting_for_person}
                onChange={(e) => setForm({ ...form, waiting_for_person: e.target.value })}
                className="gtd-input"
                placeholder="Who?"
              />
            </div>
          )}

          {/* Energy as chips */}
          <div>
            <label className="gtd-label">Energy</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setForm({ ...form, energy_level: '' })}
                className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all"
                style={
                  !form.energy_level
                    ? { background: 'rgba(255,255,255,0.06)', color: 'rgb(var(--text-1))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)' }
                    : { color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                }
              >
                —
              </button>
              {ENERGY_LEVELS.map(e => {
                const active = form.energy_level === e.value;
                return (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => setForm({ ...form, energy_level: e.value })}
                    className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all"
                    style={
                      active
                        ? {
                            background: `rgb(var(--${e.tone}) / 0.16)`,
                            color: `rgb(var(--${e.tone}-glow))`,
                            boxShadow: `inset 0 0 0 1px rgb(var(--${e.tone}) / 0.32)`,
                          }
                        : {
                            color: 'rgb(var(--text-3))',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }
                    }
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="gtd-label">Time (min)</label>
              <input
                type="number"
                value={form.time_estimate}
                onChange={(e) => setForm({ ...form, time_estimate: e.target.value })}
                className="gtd-input"
                min="1"
                placeholder="30"
              />
            </div>
            <div>
              <label className="gtd-label">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="gtd-input"
              />
            </div>
          </div>

          {/* Daily focus toggle */}
          <button
            type="button"
            onClick={() => setForm({ ...form, is_daily_focus: !form.is_daily_focus })}
            className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left"
            style={
              form.is_daily_focus
                ? { background: 'rgb(var(--amber) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)' }
                : { background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
            }
          >
            <div
              className="w-9 h-5 rounded-full relative transition-all flex-shrink-0"
              style={
                form.is_daily_focus
                  ? { background: 'rgb(var(--amber) / 0.6)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.5)' }
                  : { background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }
              }
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                style={{
                  left: form.is_daily_focus ? '18px' : '2px',
                  background: form.is_daily_focus ? 'rgb(var(--amber-glow))' : 'rgba(255,255,255,0.65)',
                  boxShadow: form.is_daily_focus ? '0 0 8px rgb(var(--amber) / 0.55)' : 'none',
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-text-1 inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" style={{ color: form.is_daily_focus ? 'rgb(var(--amber-glow))' : 'rgb(var(--text-3))' }} />
                Add to today's focus
              </div>
            </div>
          </button>

          <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={onClose}
              className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.title.trim()}
              className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NotesLinks({ notes }) {
  if (!notes) return null;
  const urls = notes.match(/https?:\/\/[^\s]+/gi);
  if (!urls?.length) return null;
  const hostname = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return 'link'; } };
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all hover:brightness-125"
          style={{ background: 'rgb(var(--mint) / 0.10)', color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)' }}
        >
          <ExternalLink className="w-3 h-3" />
          {hostname(url)}
        </a>
      ))}
    </div>
  );
}
