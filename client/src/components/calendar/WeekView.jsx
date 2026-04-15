import { useState } from 'react';
import CalendarTaskCard from '../CalendarTaskCard';
import CalendarEventCard from '../CalendarEventCard';

export default function WeekView({ days, itemsByDate, onEditTask, onCompleteTask, onDropTask, onDayClick }) {
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
    <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
      {days.map(({ date, day, dayName, isToday }) => {
        const items = itemsByDate[date] || [];
        const isDragOver = dragOverDate === date;

        return (
          <div
            key={date}
            className={`bg-white dark:bg-gray-900 p-2 min-h-[120px] md:min-h-[300px]
              ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}
              ${isDragOver ? 'calendar-drop-target' : ''}
            `}
            onDragOver={(e) => handleDragOver(e, date)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, date)}
          >
            <div
              className="text-center mb-2 cursor-pointer"
              onClick={() => onDayClick?.(date)}
            >
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                {dayName}
              </div>
              <div className={`text-lg font-semibold inline-block rounded-full w-8 h-8 flex items-center justify-center
                ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'}
              `}>
                {day}
              </div>
            </div>

            <div className="space-y-0.5">
              {items.map(item => (
                item.type === 'google_event' ? (
                  <CalendarEventCard key={item.id} event={item} />
                ) : (
                  <CalendarTaskCard
                    key={item.id}
                    task={item}
                    onEdit={onEditTask}
                    onComplete={onCompleteTask}
                  />
                )
              ))}
              {items.length === 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-600 text-center py-4 hidden md:block">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
