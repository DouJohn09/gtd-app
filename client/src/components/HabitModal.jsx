import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

export default function HabitModal({ habit, onClose, onSave }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    frequency: 'daily',
    target_days: [],
    category: '',
    color: '#3b82f6',
  });

  useEffect(() => {
    if (habit) {
      setForm({
        name: habit.name || '',
        description: habit.description || '',
        frequency: habit.frequency || 'daily',
        target_days: habit.target_days || [],
        category: habit.category || '',
        color: habit.color || '#3b82f6',
      });
    }
  }, [habit]);

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      target_days: f.target_days.includes(day)
        ? f.target_days.filter(d => d !== day)
        : [...f.target_days, day]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      target_days: form.frequency === 'specific_days' ? form.target_days
        : form.frequency === 'weekly' ? form.target_days
        : null,
    };
    onSave(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 sm:mx-auto max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {habit?.id ? 'Edit Habit' : 'New Habit'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="gtd-label">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="gtd-input"
              required
              autoFocus
              placeholder="e.g. Exercise, Read, Meditate"
            />
          </div>

          <div>
            <label className="gtd-label">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="gtd-input"
              placeholder="Optional details"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gtd-label">Frequency</label>
              <select
                value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value })}
                className="gtd-input"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (X times)</option>
                <option value="specific_days">Specific Days</option>
              </select>
            </div>

            <div>
              <label className="gtd-label">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="gtd-input"
                placeholder="e.g. health, learning"
              />
            </div>
          </div>

          {form.frequency === 'specific_days' && (
            <div>
              <label className="gtd-label">Which days?</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors ${
                      form.target_days.includes(d.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.frequency === 'weekly' && (
            <div>
              <label className="gtd-label">Times per week</label>
              <input
                type="number"
                min="1"
                max="7"
                value={form.target_days[0] || 3}
                onChange={e => setForm({ ...form, target_days: [parseInt(e.target.value)] })}
                className="gtd-input w-24"
              />
            </div>
          )}

          <div>
            <label className="gtd-label">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    form.color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t dark:border-gray-700">
            <button type="button" onClick={onClose} className="gtd-btn gtd-btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.name.trim()}
              className="gtd-btn gtd-btn-primary flex-1 disabled:opacity-50"
            >
              {habit?.id ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
