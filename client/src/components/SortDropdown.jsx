import { ArrowUpDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'date_added_newest', label: 'Date added (newest)' },
  { value: 'date_added_oldest', label: 'Date added (oldest)' },
  { value: 'due_date', label: 'Due date (soonest)' },
  { value: 'energy_low', label: 'Energy (low first)' },
  { value: 'energy_high', label: 'Energy (high first)' },
  { value: 'time_shortest', label: 'Quick wins (shortest)' },
  { value: 'time_longest', label: 'Time (longest first)' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

const COMPLETED_SORT_OPTIONS = [
  { value: 'completed_newest', label: 'Completed (newest)' },
  { value: 'completed_oldest', label: 'Completed (oldest)' },
  { value: 'priority', label: 'Priority' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

const energyOrder = { high: 3, medium: 2, low: 1 };

export function sortTasks(tasks, sortBy) {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return (b.priority || 0) - (a.priority || 0);
      case 'date_added_newest':
        return (b.created_at || '').localeCompare(a.created_at || '');
      case 'date_added_oldest':
        return (a.created_at || '').localeCompare(b.created_at || '');
      case 'due_date': {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case 'energy_low':
        return (energyOrder[a.energy_level] || 0) - (energyOrder[b.energy_level] || 0);
      case 'energy_high':
        return (energyOrder[b.energy_level] || 0) - (energyOrder[a.energy_level] || 0);
      case 'time_shortest': {
        if (!a.time_estimate && !b.time_estimate) return 0;
        if (!a.time_estimate) return 1;
        if (!b.time_estimate) return -1;
        return a.time_estimate - b.time_estimate;
      }
      case 'time_longest': {
        if (!a.time_estimate && !b.time_estimate) return 0;
        if (!a.time_estimate) return 1;
        if (!b.time_estimate) return -1;
        return b.time_estimate - a.time_estimate;
      }
      case 'alphabetical':
        return (a.title || '').localeCompare(b.title || '');
      case 'completed_newest':
        return (b.completed_at || '').localeCompare(a.completed_at || '');
      case 'completed_oldest':
        return (a.completed_at || '').localeCompare(b.completed_at || '');
      default:
        return 0;
    }
  });
}

export default function SortDropdown({ value, onChange, completed = false }) {
  const options = completed ? COMPLETED_SORT_OPTIONS : SORT_OPTIONS;

  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="w-4 h-4 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
