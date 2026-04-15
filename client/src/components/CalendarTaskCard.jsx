import { Circle } from 'lucide-react';
import { isOverdue } from '../lib/dateUtils';

const energyDotColors = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
};

const listDotColors = {
  inbox: 'bg-yellow-500',
  next_actions: 'bg-green-500',
  waiting_for: 'bg-orange-500',
  someday_maybe: 'bg-blue-500',
};

export default function CalendarTaskCard({ task, onEdit, onComplete, onDragStart }) {
  const overdue = isOverdue(task.due_date);

  return (
    <div
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id.toString());
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task.id);
      }}
      onClick={() => onEdit?.(task)}
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs cursor-pointer group transition-colors
        ${task.is_daily_focus === 1 ? 'border-l-2 border-yellow-400' : ''}
        ${overdue ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
      `}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete?.(task.id);
        }}
        className="text-gray-400 hover:text-green-600 flex-shrink-0"
      >
        <Circle className="w-3 h-3" />
      </button>

      {task.list && listDotColors[task.list] && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${listDotColors[task.list]}`} />
      )}

      <span className="truncate flex-1">{task.title}</span>

      {task.energy_level && energyDotColors[task.energy_level] && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${energyDotColors[task.energy_level]}`} />
      )}
    </div>
  );
}
