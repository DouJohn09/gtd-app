import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';

const COLORS = ['#a78bfa', '#5eead4', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#34d399', '#f97316'];
const DAYS = [
  { value: 'mon', label: 'M' },
  { value: 'tue', label: 'T' },
  { value: 'wed', label: 'W' },
  { value: 'thu', label: 'T' },
  { value: 'fri', label: 'F' },
  { value: 'sat', label: 'S' },
  { value: 'sun', label: 'S' },
];

const DEFAULT_CATEGORIES = [
  'Health', 'Fitness', 'Mindfulness', 'Learning',
  'Productivity', 'Self-Care', 'Social', 'Finance',
];

export const SUGGESTED_HABITS = [
  { name: 'Exercise',          description: '30 min workout',         category: 'Fitness',      color: '#fb7185', frequency: 'daily' },
  { name: 'Read',              description: 'Read for 20 minutes',    category: 'Learning',     color: '#60a5fa', frequency: 'daily' },
  { name: 'Meditate',          description: '10 min meditation',      category: 'Mindfulness',  color: '#a78bfa', frequency: 'daily' },
  { name: 'Drink Water',       description: '8 glasses of water',     category: 'Health',       color: '#5eead4', frequency: 'daily' },
  { name: 'Journal',           description: 'Write daily reflections', category: 'Mindfulness', color: '#fbbf24', frequency: 'daily' },
  { name: 'Sleep 8 Hours',     description: 'Get enough rest',        category: 'Health',       color: '#34d399', frequency: 'daily' },
  { name: 'No Social Media',   description: 'Limit screen time',      category: 'Productivity', color: '#f472b6', frequency: 'daily' },
  { name: 'Learn Something New', description: 'Study or practice',    category: 'Learning',     color: '#f97316', frequency: 'daily' },
];

export default function HabitModal({ habit, onClose, onSave, existingCategories = [], existingHabitNames = [] }) {
  const [form, setForm] = useState({
    name: '', description: '', frequency: 'daily', target_days: [],
    category: '', color: '#a78bfa',
  });
  const [customCategory, setCustomCategory] = useState(false);
  const [customCategoryValue, setCustomCategoryValue] = useState('');

  const allCategories = useMemo(() => {
    const merged = new Set([...DEFAULT_CATEGORIES, ...existingCategories]);
    return [...merged].sort();
  }, [existingCategories]);

  const availableSuggestions = useMemo(() => {
    const names = new Set(existingHabitNames.map(n => n.toLowerCase()));
    return SUGGESTED_HABITS.filter(s => !names.has(s.name.toLowerCase()));
  }, [existingHabitNames]);

  useEffect(() => {
    if (habit) {
      const cat = habit.category || '';
      const isCustom = cat && !DEFAULT_CATEGORIES.includes(cat) && !existingCategories.includes(cat);
      setForm({
        name: habit.name || '',
        description: habit.description || '',
        frequency: habit.frequency || 'daily',
        target_days: habit.target_days || [],
        category: isCustom ? '__custom__' : cat,
        color: habit.color || '#a78bfa',
      });
      if (isCustom) { setCustomCategory(true); setCustomCategoryValue(cat); }
    }
  }, [habit, existingCategories]);

  // Esc to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      target_days: f.target_days.includes(day)
        ? f.target_days.filter(d => d !== day)
        : [...f.target_days, day],
    }));
  };

  const handleCategoryChange = (value) => {
    if (value === '__custom__') {
      setCustomCategory(true);
      setForm(f => ({ ...f, category: '__custom__' }));
    } else {
      setCustomCategory(false);
      setCustomCategoryValue('');
      setForm(f => ({ ...f, category: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const category = customCategory ? customCategoryValue.trim() : form.category;
    const data = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: category || null,
      target_days: form.frequency === 'specific_days' ? form.target_days
        : form.frequency === 'weekly' ? form.target_days
        : null,
    };
    onSave(data);
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
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <div>
            <div className="mono-label" style={{ color: 'rgb(var(--mint-glow))' }}>
              {habit?.id ? 'edit_habit' : 'new_habit'}
            </div>
            <h2 className="font-display text-[24px] leading-tight mt-0.5">
              {habit?.id ? 'Edit Habit' : 'New Habit'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Suggestions */}
        {!habit?.id && availableSuggestions.length > 0 && (
          <div className="p-5 border-b border-white/[0.05]">
            <div className="mono-label mb-3 inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-glow" /> quick_add
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableSuggestions.slice(0, 6).map(s => (
                <button
                  key={s.name}
                  onClick={() => onSave(s)}
                  className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full transition-all hover:bg-white/[0.04]"
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                  <span className="text-text-1">{s.name}</span>
                  <Plus className="w-3 h-3 text-text-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="gtd-label">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="gtd-input"
              required
              autoFocus
              placeholder="Exercise, Read, Meditate…"
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
              <select
                value={customCategory ? '__custom__' : form.category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="gtd-input"
              >
                <option value="">No category</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
              {customCategory && (
                <input
                  type="text"
                  value={customCategoryValue}
                  onChange={e => setCustomCategoryValue(e.target.value)}
                  className="gtd-input mt-2"
                  placeholder="Category name"
                  autoFocus
                />
              )}
            </div>
          </div>

          {form.frequency === 'specific_days' && (
            <div>
              <label className="gtd-label">Days</label>
              <div className="flex gap-1">
                {DAYS.map(d => {
                  const active = form.target_days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className="w-9 h-9 rounded-lg font-mono text-[12px] uppercase transition-all"
                      style={
                        active
                          ? {
                              background: `linear-gradient(180deg, ${form.color}33, ${form.color}1f)`,
                              color: form.color,
                              boxShadow: `inset 0 0 0 1px ${form.color}55`,
                            }
                          : {
                              color: 'rgb(var(--text-3))',
                              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                            }
                      }
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.frequency === 'weekly' && (
            <div>
              <label className="gtd-label">Times per week</label>
              <input
                type="number"
                min="1" max="7"
                value={form.target_days[0] || 3}
                onChange={e => setForm({ ...form, target_days: [parseInt(e.target.value)] })}
                className="gtd-input w-24"
              />
            </div>
          )}

          <div>
            <label className="gtd-label">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => {
                const active = form.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className="w-8 h-8 rounded-full transition-transform"
                    style={{
                      background: c,
                      transform: active ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: active
                        ? `0 0 0 2px rgb(var(--bg)), 0 0 0 4px ${c}, 0 0 16px ${c}99`
                        : `0 0 8px ${c}55`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/[0.05]">
            <button type="button" onClick={onClose} className="gtd-btn gtd-btn-secondary flex-1 text-[12.5px]">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.name.trim()}
              className="gtd-btn gtd-btn-primary flex-1 text-[12.5px] disabled:opacity-50"
            >
              {habit?.id ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
