import { useState, useEffect } from 'react';
import { X, AlertCircle, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './Toast';

const lists = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'next_actions', label: 'Next Actions' },
  { value: 'waiting_for', label: 'Waiting For' },
  { value: 'someday_maybe', label: 'Someday/Maybe' },
];

const energyLevels = ['low', 'medium', 'high'];

export default function TaskModal({ task, projects, onClose, onSave }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    title: '',
    notes: '',
    list: 'inbox',
    context: '',
    project_id: '',
    waiting_for_person: '',
    due_date: '',
    energy_level: '',
    time_estimate: '',
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

  const handleAddContext = async () => {
    if (!newContextName.trim()) return;
    try {
      const created = await api.contexts.create(newContextName);
      setContexts([...contexts, created]);
      setForm({ ...form, context: created.name });
      setNewContextName('');
      setAddingContext(false);
    } catch (err) {
      addToast(err.message, 'error');
    }
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
        addToast('Task updated successfully', 'success');
      } else {
        await api.tasks.create(data);
        addToast('Task created successfully', 'success');
      }
      onSave?.();
      onClose();
    } catch (err) {
      console.error('Failed to save task:', err);
      setError(err.message || 'Failed to save task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {task?.id ? 'Edit Task' : 'New Task'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="gtd-input"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="gtd-input min-h-[80px]"
              placeholder="Additional details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">List *</label>
              <select
                value={form.list}
                onChange={(e) => setForm({ ...form, list: e.target.value })}
                className="gtd-input"
              >
                {lists.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
              {addingContext ? (
                <div className="flex gap-1">
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
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <select
                  value={form.context}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setAddingContext(true);
                    } else {
                      setForm({ ...form, context: e.target.value });
                    }
                  }}
                  className="gtd-input"
                >
                  <option value="">No context</option>
                  {contexts.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="__add_new__">+ Add new context...</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
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

          {form.list === 'waiting_for' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Waiting For (Person)</label>
              <input
                type="text"
                value={form.waiting_for_person}
                onChange={(e) => setForm({ ...form, waiting_for_person: e.target.value })}
                className="gtd-input"
                placeholder="Who are you waiting for?"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Energy</label>
              <select
                value={form.energy_level}
                onChange={(e) => setForm({ ...form, energy_level: e.target.value })}
                className="gtd-input"
              >
                <option value="">--</option>
                {energyLevels.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time (min)</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="gtd-input"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="daily_focus"
              checked={form.is_daily_focus}
              onChange={(e) => setForm({ ...form, is_daily_focus: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="daily_focus" className="text-sm text-gray-700">
              Add to today's focus
            </label>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="gtd-btn gtd-btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.title.trim()}
              className="gtd-btn gtd-btn-primary flex-1 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
