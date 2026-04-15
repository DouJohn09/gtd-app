import { useState, useMemo } from 'react';
import { Calendar, X } from 'lucide-react';
import CalendarTaskCard from '../CalendarTaskCard';

const LIST_FILTERS = [
  { value: '', label: 'All Lists' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'next_actions', label: 'Next Actions' },
  { value: 'waiting_for', label: 'Waiting For' },
  { value: 'someday_maybe', label: 'Someday/Maybe' },
];

export default function UnscheduledSidebar({ tasks, onEditTask, onCompleteTask, isOpen, onToggle }) {
  const [filter, setFilter] = useState('');

  const filteredTasks = useMemo(() => {
    if (!filter) return tasks;
    return tasks.filter(t => t.list === filter);
  }, [tasks, filter]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Unscheduled</h3>
          <span className="gtd-badge bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {filteredTasks.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="gtd-input text-xs mb-3 py-1.5"
      >
        {LIST_FILTERS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-600">
            <Calendar className="w-8 h-8 mx-auto mb-2" />
            <p className="text-xs">No unscheduled tasks</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <CalendarTaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onComplete={onCompleteTask}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block w-72 flex-shrink-0 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 self-start sticky top-4 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={onToggle}
          />
          <div className="md:hidden fixed right-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 p-3 z-50 animate-slide-in">
            {sidebar}
          </div>
        </>
      )}
    </>
  );
}
