import { useState, useEffect, useMemo } from 'react';
import { Target, Plus, Flame, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import HabitCard from '../components/HabitCard';
import HabitModal, { SUGGESTED_HABITS } from '../components/HabitModal';

export default function Habits() {
  const { addToast } = useToast();
  const { isDark } = useTheme();
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
    } catch (err) {
      addToast(err.message, 'error');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggle = async (habitId, date) => {
    try {
      const result = await api.habits.toggle(habitId, date);
      if (!date) {
        // Only update local state for today's toggle
        setHabits(prev => prev.map(h =>
          h.id === habitId ? { ...h, completed_today: !h.completed_today } : h
        ));
      }
      addToast(date ? `Habit ${result.completed ? 'logged' : 'unlogged'} for ${date}` : undefined);
      // Refresh stats after toggle
      const statsData = await api.habits.getStats();
      setStats(statsData);
    } catch (err) {
      addToast(err.message, 'error');
    }
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
      setShowModal(false);
      setEditingHabit(null);
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this habit and all its history?')) return;
    try {
      await api.habits.delete(id);
      addToast('Habit deleted', 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Group habits by category
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

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-7 h-7 text-blue-600" />
            Habits
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {totalCount > 0 ? `${completedCount}/${totalCount} done today` : 'Track your daily habits'}
          </p>
        </div>
        <button
          onClick={() => { setEditingHabit(null); setShowModal(true); }}
          className="gtd-btn gtd-btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Habit
        </button>
      </div>

      {/* Today's Habits */}
      {habits.length === 0 ? (
        <div>
          <div className="gtd-card text-center py-8 text-gray-500 mb-6">
            <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No habits yet</p>
            <p className="text-sm mt-1">Pick from the suggestions below or create your own</p>
          </div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Suggested Habits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUGGESTED_HABITS.map(s => (
              <div key={s.name} className="gtd-card flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.description}</p>
                </div>
                <button
                  onClick={async () => {
                    await api.habits.create(s);
                    addToast(`Added "${s.name}"`, 'success');
                    fetchData();
                  }}
                  className="gtd-btn gtd-btn-primary text-xs px-3 py-1 flex-shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Habit cards by category */}
          {Object.entries(grouped).map(([category, categoryHabits]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
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

          {/* Stats section */}
          {stats && stats.habits?.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Stats (Last 30 Days)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {stats.habits.map(h => (
                  <div key={h.id} className="gtd-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color }} />
                      <span className="font-medium text-sm truncate">{h.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold" style={{ color: h.color }}>{h.completionRate}%</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{h.completedLast30}/{h.expectedLast30} days</div>
                      </div>
                      {h.streak > 0 && (
                        <div className="flex items-center gap-1 text-orange-500">
                          <Flame className="w-5 h-5" />
                          <span className="font-bold">{h.streak}</span>
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
              <h2 className="text-lg font-semibold mb-3">Activity (Last 90 Days)</h2>
              <div className="gtd-card">
                <Heatmap data={stats.heatmap} totalHabits={habits.length} isDark={isDark} />
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

// Calendar heatmap component
function Heatmap({ data, totalHabits, isDark }) {
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
    if (isDark) {
      if (intensity === 0) return '#1f2937';
      if (intensity <= 0.25) return '#064e3b';
      if (intensity <= 0.5) return '#065f46';
      if (intensity <= 0.75) return '#047857';
      return '#059669';
    }
    if (intensity === 0) return '#f3f4f6';
    if (intensity <= 0.25) return '#bbf7d0';
    if (intensity <= 0.5) return '#86efac';
    if (intensity <= 0.75) return '#4ade80';
    return '#22c55e';
  };

  // Group by weeks (columns)
  const weeks = [];
  let currentWeek = [];
  // Pad first week
  if (cells.length > 0) {
    for (let i = 0; i < cells[0].day; i++) {
      currentWeek.push(null);
    }
  }
  cells.forEach(cell => {
    currentWeek.push(cell);
    if (cell.day === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
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
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getColor(cell.intensity) }}
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
