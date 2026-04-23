import { useState } from 'react';
import CalendarTaskCard from '../CalendarTaskCard';
import CalendarEventCard from '../CalendarEventCard';
import TimeGrid from './TimeGrid';

export default function WeekView({ days, itemsByDate, onEditTask, onCompleteTask, onDropTask, onDayClick, onUpdateTask }) {
  const [dragOverDate, setDragOverDate] = useState(null);

  const handleAllDayDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };
  const handleAllDayDrop = (e, date) => {
    e.preventDefault();
    setDragOverDate(null);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date, null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map(({ date, day, dayName, isToday }) => {
        const items = itemsByDate[date] || [];
        const timeBlocks = items.filter(i => i.type !== 'google_event' && i.scheduled_time);
        const allDayItems = items.filter(i => i.type === 'google_event' || !i.scheduled_time);
        const isDragOver = dragOverDate === date;

        return (
          <div
            key={date}
            className="rounded-2xl glass p-2 flex flex-col"
            style={{
              boxShadow: isToday
                ? '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgb(var(--violet))'
                : undefined,
            }}
          >
            <button
              onClick={() => onDayClick?.(date)}
              className="text-center mb-2 cursor-pointer w-full"
            >
              <div className="mono-label text-[9.5px]">{dayName}</div>
              <div
                className="font-display text-[18px] leading-none mt-1 inline-grid place-items-center w-7 h-7 rounded-full"
                style={
                  isToday
                    ? { background: 'rgb(var(--violet))', color: '#0a0a0f', boxShadow: '0 0 14px rgba(167,139,250,0.55)' }
                    : {}
                }
              >
                {day}
              </div>
            </button>

            {/* All-day section (drop target for date-only) */}
            <div
              onDragOver={(e) => handleAllDayDragOver(e, date)}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => handleAllDayDrop(e, date)}
              className="rounded-md p-1 mb-1 min-h-[24px] transition-colors"
              style={{
                background: isDragOver ? 'rgba(167,139,250,0.06)' : undefined,
                boxShadow: isDragOver ? 'inset 0 0 0 1px rgba(167,139,250,0.5)' : undefined,
              }}
            >
              <div className="space-y-0.5">
                {allDayItems.map(item => (
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
              </div>
            </div>

            {/* Compact time grid */}
            <div className="hidden md:block">
              <TimeGrid
                date={date}
                timeBlocks={timeBlocks}
                onDropTask={onDropTask}
                onEditTask={onEditTask}
                onCompleteTask={onCompleteTask}
                onUpdateTask={onUpdateTask}
                compact
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
