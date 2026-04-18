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
  const handleDragLeave = () => setDragOverDate(null);
  const handleDrop = (e, date) => {
    e.preventDefault();
    setDragOverDate(null);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {days.map(({ date, day, dayName, isToday }) => {
        const items = itemsByDate[date] || [];
        const isDragOver = dragOverDate === date;

        return (
          <div
            key={date}
            onDragOver={(e) => handleDragOver(e, date)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, date)}
            className="rounded-2xl glass p-3 min-h-[120px] md:min-h-[320px] transition-colors"
            style={{
              boxShadow: isDragOver
                ? '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(167,139,250,0.6)'
                : isToday
                  ? '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgb(var(--violet))'
                  : undefined,
              background: isDragOver ? 'rgba(167,139,250,0.06)' : undefined,
            }}
          >
            <button
              onClick={() => onDayClick?.(date)}
              className="text-center mb-3 cursor-pointer w-full"
            >
              <div className="mono-label">{dayName}</div>
              <div
                className="font-display text-[24px] leading-none mt-1.5 inline-grid place-items-center w-9 h-9 rounded-full"
                style={
                  isToday
                    ? { background: 'rgb(var(--violet))', color: '#0a0a0f', boxShadow: '0 0 14px rgba(167,139,250,0.55)' }
                    : {}
                }
              >
                {day}
              </div>
            </button>

            <div className="space-y-1">
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
                <div className="font-mono text-[10.5px] text-text-3 text-center py-6 hidden md:block">
                  empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
