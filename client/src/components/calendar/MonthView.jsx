import { useState } from 'react';
import { getDayNames } from '../../lib/dateUtils';
import CalendarTaskCard from '../CalendarTaskCard';

const MAX_VISIBLE_TASKS = 3;

export default function MonthView({ days, tasksByDate, onEditTask, onCompleteTask, onDropTask, onDayClick }) {
  const dayNames = getDayNames();
  const [dragOverDate, setDragOverDate] = useState(null);

  const handleDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e, date) => {
    e.preventDefault();
    setDragOverDate(null);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date);
  };

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(name => (
          <div key={name} className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase text-center py-2">
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(({ date, day, isCurrentMonth, isToday }) => {
          const tasks = tasksByDate[date] || [];
          const visibleTasks = tasks.slice(0, MAX_VISIBLE_TASKS);
          const overflow = tasks.length - MAX_VISIBLE_TASKS;
          const isDragOver = dragOverDate === date;

          return (
            <div
              key={date}
              className={`calendar-cell ${isToday ? 'calendar-cell-today' : ''} ${!isCurrentMonth ? 'calendar-cell-other-month' : ''} ${isDragOver ? 'calendar-drop-target' : ''}`}
              onDragOver={(e) => handleDragOver(e, date)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
            >
              <div
                className={`text-xs font-medium mb-1 cursor-pointer hover:text-blue-600 inline-block rounded-full w-6 h-6 flex items-center justify-center
                  ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}
                `}
                onClick={() => onDayClick?.(date)}
              >
                {day}
              </div>

              <div className="space-y-0.5">
                {visibleTasks.map(task => (
                  <CalendarTaskCard
                    key={task.id}
                    task={task}
                    onEdit={onEditTask}
                    onComplete={onCompleteTask}
                  />
                ))}
                {overflow > 0 && (
                  <div
                    className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline pl-1"
                    onClick={() => onDayClick?.(date)}
                  >
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
