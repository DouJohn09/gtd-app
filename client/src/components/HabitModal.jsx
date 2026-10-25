import { createPortal } from 'react-dom';
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

// The default count shown in the weekly / interval inputs when nothing is picked.
const FREQ_DEFAULT = { weekly: 3, interval: 2 };

// weekly/interval store a single count in target_days[0]; specific_days stores an
// array of weekday values. Clamp counts to a real integer so an untouched or
// cleared input saves what the UI displayed (not undefined → server default 1).
function normalizeTargetDays(frequency, targetDays) {
  if (frequency === 'weekly' || frequency === 'interval') {
    const n = parseInt(targetDays?.[0], 10);
    const fallback = FREQ_DEFAULT[frequency];
    return [Number.isFinite(n) && n >= 1 ? n : fallback];
  }
  if (frequency === 'specific_days') return targetDays || [];
  return null; // daily
}

export const SUGGESTED_HABITS = [
  { name: 'Exercise',          description: '30 min workout',         category: 'Fitness',      color: '#fb7185', frequency: 'daily' },
  { name: 'Read',              description: 'Read for 20 minutes',    category: 'Learning',     color: '#60a5fa', frequency: 'daily' },
  { name: 'Meditate',          description: '10 min meditation',      category: 'Mindfulness',  color: '#a78bfa', frequency: 'daily' },
  { name: 'Drink Water',       description: '8 glasses of water',     category: 'Health',       color: '#5eead4', frequency: 'daily' },
  { name: 'Journal',           description: 'Write daily reflections', category: 'Mindfulness', color: '#fbbf24', frequency: 'daily' },
  { name: 'Sleep 8 Hours',     description: 'Get enough rest',        category: 'Health',       color: '#34d399', frequency: 'daily' },
  { name: 'No Social Media',   description: 'Stay off the feeds',     category: 'Productivity', color: '#f472b6', frequency: 'daily', type: 'quit' },
  { name: 'Learn Something New', description: 'Study or practice',    category: 'Learning',     color: '#f97316', frequency: 'daily' },
];

export default function HabitModal({ habit, onClose, onSave, existingCategories = [], existingHabitNames = [] }) {
  const [form, setForm] = useState({
    name: '', description: '', frequency: 'daily', target_days: [],
    category: '', color: '#a78bfa', type: 'build',
    when: 'any', preferred_time: '07:00', duration: 30,
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
        type: habit.type || 'build',
        when: habit.preferred_time ? 'time' : habit.time_of_day || 'any',
        preferred_time: habit.preferred_time || '07:00',
        duration: habit.duration || 30,
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
    const isQuit = form.type === 'quit';
    const data = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: category || null,
      // Quit habits are daily abstinence — frequency/target_days don't apply.
      frequency: isQuit ? 'daily' : form.frequency,
      // weekly/interval carry a single count; the input can display a default (3/2)
      // while state is still [] or [NaN] (empty input), which the server would read
      // as 1×/week. Clamp to a real number so the saved target matches what's shown.
      target_days: isQuit ? null : normalizeTargetDays(form.frequency, form.target_days),
      // When it happens — a fixed time, or a part of the day the planner
      // finds room in. Quit habits and "any time" reserve nothing.
      preferred_time: !isQuit && form.when === 'time' ? form.preferred_time : null,
      time_of_day: !isQuit && ['morning', 'afternoon', 'evening'].includes(form.when) ? form.when : null,
      duration: !isQuit && form.when !== 'any' ? Number(form.duration) || 30 : null,
    };
    delete data.when;
    onSave(data);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: 'rgba(8,8,14,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md my-6 rounded-2xl glass overflow-hidden flex flex-col max-h-[calc(100dvh-80px)] sm:max-h-none"
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
            className="tap-expand grid place-items-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 min-h-0 sm:max-h-[65vh] overflow-y-auto">
          <div>
            <label className="gtd-label">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'build', label: 'Build a habit' },
                { value: 'quit', label: 'Quit a habit' },
              ].map(opt => {
                const active = (form.type || 'build') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => opt.value === 'quit'
                      ? { ...f, type: 'quit', frequency: 'daily', target_days: [] }
                      : { ...f, type: 'build' })}
                    className="py-2 rounded-lg text-[12.5px] font-medium transition-all"
                    style={active
                      ? { background: 'linear-gradient(180deg, rgb(var(--mint) / 0.20), rgb(var(--mint) / 0.10))', color: 'rgb(var(--mint-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.35)' }
                      : { color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-text-3 mt-1.5">
              {form.type === 'quit'
                ? 'Tracks days clean. Tap a day only if you slip — no streak shame.'
                : 'Tracks the days you do it.'}
            </p>
          </div>

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
            {form.type !== 'quit' && (
              <div>
                <label className="gtd-label">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={e => {
                    const freq = e.target.value;
                    // Seed the count default so the input's displayed value (3/2)
                    // is actually in state — not just shown — for weekly/interval.
                    const seeded = freq === 'weekly' ? [FREQ_DEFAULT.weekly]
                      : freq === 'interval' ? [FREQ_DEFAULT.interval] : [];
                    setForm({ ...form, frequency: freq, target_days: seeded });
                  }}
                  className="gtd-input"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly (X times)</option>
                  <option value="specific_days">Specific Days</option>
                  <option value="interval">Every N days</option>
                </select>
              </div>
            )}

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
              <p className="text-[11.5px] text-text-3 mt-1.5">
                A goal, not a quota — hit it on whichever days suit you.
              </p>
            </div>
          )}

          {form.frequency === 'interval' && (
            <div>
              <label className="gtd-label">Repeat every</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="2" max="365"
                  value={form.target_days[0] || 2}
                  onChange={e => setForm({ ...form, target_days: [parseInt(e.target.value)] })}
                  className="gtd-input w-24"
                />
                <span className="text-[13px] text-text-3">days</span>
              </div>
              <p className="text-[11.5px] text-text-3 mt-1.5">
                Counts from the day you create it — e.g. every 3 days.
              </p>
            </div>
          )}

          {form.type !== 'quit' && (
            <div>
              <label className="gtd-label">When</label>
              <div className="flex flex-wrap gap-1.5">
                {[['any', 'Any time'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['time', 'At a time']].map(([value, label]) => {
                  const active = form.when === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, when: value })}
                      className="px-2.5 py-1 rounded-lg text-[12px] transition-colors"
                      style={active
                        ? { background: 'rgb(var(--violet) / 0.16)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.45)', color: 'rgb(var(--text-1))' }
                        : { boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.08)', color: 'rgb(var(--text-3))' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {form.when !== 'any' && (
                <div className="flex items-center gap-2 mt-2.5">
                  {form.when === 'time' && (
                    <input
                      type="time"
                      value={form.preferred_time}
                      onChange={e => setForm({ ...form, preferred_time: e.target.value })}
                      className="gtd-input w-32"
                      required
                    />
                  )}
                  <select
                    value={form.duration}
                    onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
                    className="gtd-input w-32"
                  >
                    {[5, 10, 15, 20, 30, 45, 60, 90, 120].map(m => (
                      <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('1.5 h', '1½ h')}</option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-[11.5px] text-text-3 mt-1.5">
                {form.when === 'any'
                  ? 'Pick a time or part of the day and Plan my day keeps room for it; it also shows in your calendar.'
                  : form.frequency === 'weekly'
                    ? '"Times per week" habits have no set day, so plans don\'t reserve time for them.'
                    : form.when === 'time'
                      ? 'Plans and the calendar keep this time free on the days it\'s due.'
                      : 'Plans find a free slot for it in that part of the day.'}
              </p>
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

          <div className="sticky -bottom-5 -mx-5 -mb-5 px-5 pb-5 flex gap-2 pt-3 border-t border-white/[0.05]" style={{ background: 'rgba(16,16,24,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
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
    </div>,
    document.body
  );
}
