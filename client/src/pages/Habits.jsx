import { useState, useEffect, useMemo } from 'react';
import { Target, Plus, Flame, TrendingUp, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import HabitCard from '../components/HabitCard';
import HabitModal, { SUGGESTED_HABITS } from '../components/HabitModal';
import MonoLabel from '../components/ui/MonoLabel';

const HEAT_TONES = [
  'rgba(255,255,255,0.04)',
  'rgb(var(--mint) / 0.18)',
  'rgb(var(--mint) / 0.36)',
  'rgb(var(--mint) / 0.55)',
  'rgb(var(--mint) / 0.85)',
];

export default function Habits() {
  const { addToast } = useToast();
  const [habits, setHabits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [habitsData, statsData] = await Promise.all([
        api.habits.getAll(),
        api.habits.getStats(),
      ]);
      setHabits(habitsData);
      setStats(statsData);
    } catch (err) { addToast(err.message, 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggle = async (habitId, date) => {
    try {
      const result = await api.habits.toggle(habitId, date);
      if (!date) {
        setHabits(prev => prev.map(h =>
          h.id === habitId ? { ...h, completed_today: !h.completed_today } : h
        ));
      }
      addToast(date ? `Habit ${result.completed ? 'logged' : 'unlogged'} for ${date}` : undefined);
      const statsData = await api.habits.getStats();
      setStats(statsData);
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSave = async (data) => {
    try {
      if (editingHabit?.id) {
        await api.habits.update(editingHabit.id, data);
        addToast('Habit updated', 'success');
      } else {
        await api.habits.create(data);
        addToast('Habit created', 'success');
      }
      setShowModal(false); setEditingHabit(null); fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this habit and all its history?')) return;
    try { await api.habits.delete(id); addToast('Habit deleted', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };

  const grouped = useMemo(() => {
    const groups = {};
    habits.forEach(h => {
      const cat = h.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(h);
    });
    return groups;
  }, [habits]);

  const completedCount = habits.filter(h => h.completed_today).length;
  const totalCount = habits.length;
  const dayPct = totalCount > 0 ? completedCount / totalCount : 0;

  if (loading) {
    return (
      <div className="px-6 lg:px-12 pt-10 pb-20">
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1500px]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <MonoLabel tone="mint" className="mb-3">rituals</MonoLabel>
          <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">
            Habits
            {totalCount > 0 && (
              <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
                {completedCount.toString().padStart(2, '0')}/{totalCount.toString().padStart(2, '0')}
              </span>
            )}
          </h1>
          {totalCount > 0 && (
            <p className="font-display italic text-[18px] text-text-2 mt-2">
              {dayPct === 1 ? 'A perfect day. All done.' :
                dayPct >= 0.5 ? 'Halfway through. Keep going.' :
                  'Build the day, one ritual at a time.'}
            </p>
          )}
        </div>
        <button
          onClick={() => { setEditingHabit(null); setShowModal(true); }}
          className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px]"
        >
          <Plus className="w-3.5 h-3.5" /> New Habit
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="space-y-6">
          {/* Empty state */}
          <div className="rounded-2xl glass p-10 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 50% 30%, rgb(var(--mint) / 0.10), transparent 60%)' }}
            />
            <div className="relative">
              <div
                className="inline-grid place-items-center w-14 h-14 rounded-2xl mb-4"
                style={{ background: 'rgb(var(--mint) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)' }}
              >
                <Target className="w-6 h-6" style={{ color: 'rgb(var(--mint-glow))' }} />
              </div>
              <div className="mono-label mb-2" style={{ color: 'rgb(var(--mint-glow))' }}>no_rituals_yet</div>
              <div className="font-display italic text-[28px] mb-1">Begin a small thing.</div>
              <p className="text-[13px] text-text-2">Pick a starter below or design your own.</p>
            </div>
          </div>

          {/* Suggested */}
          <div>
            <div className="flex items-baseline gap-3 mb-3 px-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-glow" />
              <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>suggested</div>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUGGESTED_HABITS.map(s => (
                <div key={s.name} className="rounded-2xl glass p-4 flex items-center gap-3 group">
                  <div
                    className="w-9 h-9 rounded-xl flex-shrink-0 grid place-items-center"
                    style={{ background: `${s.color}22`, boxShadow: `inset 0 0 0 1px ${s.color}55` }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-text-1 truncate">{s.name}</p>
                    <p className="text-[11.5px] text-text-3 truncate">{s.description}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await api.habits.create(s);
                      addToast(`Added "${s.name}"`, 'success');
                      fetchData();
                    }}
                    className="gtd-btn gtd-btn-secondary text-[11px] py-1 px-2.5 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Habits by category */}
          {Object.entries(grouped).map(([category, categoryHabits]) => (
            <div key={category}>
              <div className="flex items-baseline gap-3 mb-3 px-1">
                <div className="mono-label">{category.toLowerCase().replace(/\s+/g, '_')}</div>
                <span className="font-mono text-[10.5px] text-text-3">
                  {categoryHabits.filter(h => h.completed_today).length}/{categoryHabits.length}
                </span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
              </div>
              <div className="space-y-2">
                {categoryHabits.map(habit => (
                  <HabitCard
                    key={habit.id}
                    habit={{ ...habit, streak: stats?.habits?.find(s => s.id === habit.id)?.streak || 0 }}
                    onToggle={handleToggle}
                    onEdit={(h) => { setEditingHabit(h); setShowModal(true); }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Stats grid */}
          {stats && stats.habits?.length > 0 && (
            <div>
              <div className="flex items-baseline gap-3 mb-3 px-1">
                <TrendingUp className="w-3.5 h-3.5 text-mint-glow" />
                <div className="mono-label" style={{ color: 'rgb(var(--mint-glow))' }}>last_30_days</div>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {stats.habits.map(h => (
                  <div key={h.id} className="rounded-2xl glass p-4 relative overflow-hidden">
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: h.color, boxShadow: `0 0 10px ${h.color}aa` }}
                      />
                      <span className="text-[12.5px] font-medium text-text-1 truncate">{h.name}</span>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <div className="font-display text-[34px] leading-none" style={{ color: h.color }}>
                          {h.completionRate}<span className="text-[16px] text-text-3 ml-0.5">%</span>
                        </div>
                        <div className="font-mono text-[10.5px] text-text-3 mt-1">
                          {h.completedLast30}/{h.expectedLast30} days
                        </div>
                      </div>
                      {h.streak > 0 && (
                        <div
                          className="flex items-center gap-1 px-2 py-1 rounded-full"
                          style={{ background: 'rgb(var(--amber) / 0.12)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.25)' }}
                        >
                          <Flame className="w-3 h-3" style={{ color: 'rgb(var(--amber-glow))' }} />
                          <span className="font-mono text-[11px]" style={{ color: 'rgb(var(--amber-glow))' }}>{h.streak}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Heatmap */}
          {stats?.heatmap && Object.keys(stats.heatmap).length > 0 && (
            <div>
              <div className="flex items-baseline gap-3 mb-3 px-1">
                <div className="mono-label">activity_90d</div>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
              </div>
              <div className="rounded-2xl glass p-5">
                <Heatmap data={stats.heatmap} totalHabits={habits.length} />
                <div className="flex items-center justify-end gap-2 mt-4">
                  <span className="font-mono text-[10px] text-text-3 uppercase tracking-wider">less</span>
                  <div className="flex gap-[3px]">
                    {HEAT_TONES.map((tone, i) => (
                      <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: tone, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }} />
                    ))}
                  </div>
                  <span className="font-mono text-[10px] text-text-3 uppercase tracking-wider">more</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <HabitModal
          habit={editingHabit}
          onClose={() => { setShowModal(false); setEditingHabit(null); }}
          onSave={handleSave}
          existingCategories={[...new Set(habits.map(h => h.category).filter(Boolean))]}
          existingHabitNames={habits.map(h => h.name)}
        />
      )}
    </div>
  );
}

function Heatmap({ data, totalHabits }) {
  const cells = useMemo(() => {
    const result = [];
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = data[dateStr] || 0;
      const intensity = totalHabits > 0 ? count / totalHabits : 0;
      result.push({ date: dateStr, count, intensity, day: d.getDay() });
    }
    return result;
  }, [data, totalHabits]);

  const getColor = (intensity) => {
    if (intensity === 0) return HEAT_TONES[0];
    if (intensity <= 0.25) return HEAT_TONES[1];
    if (intensity <= 0.5) return HEAT_TONES[2];
    if (intensity <= 0.75) return HEAT_TONES[3];
    return HEAT_TONES[4];
  };

  const weeks = [];
  let currentWeek = [];
  if (cells.length > 0) {
    for (let i = 0; i < cells[0].day; i++) currentWeek.push(null);
  }
  cells.forEach(cell => {
    currentWeek.push(cell);
    if (cell.day === 6) { weeks.push(currentWeek); currentWeek = []; }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((cell, ci) => (
            cell ? (
              <div
                key={ci}
                className="w-3 h-3 rounded-sm transition-transform hover:scale-110"
                style={{
                  background: getColor(cell.intensity),
                  boxShadow: cell.intensity > 0
                    ? `inset 0 0 0 1px rgb(var(--mint) / ${0.3 + cell.intensity * 0.4})`
                    : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }}
                title={`${cell.date}: ${cell.count}/${totalHabits} habits`}
              />
            ) : (
              <div key={ci} className="w-3 h-3" />
            )
          ))}
        </div>
      ))}
    </div>
  );
}
