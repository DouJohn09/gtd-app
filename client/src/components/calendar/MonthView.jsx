import { useState } from 'react';
import { getDayNames } from '../../lib/dateUtils';
import CalendarTaskCard from '../CalendarTaskCard';
import CalendarEventCard from '../CalendarEventCard';

const MAX_VISIBLE_ITEMS = 3;

export default function MonthView({ days, itemsByDate, onEditTask, onCompleteTask, onDropTask, onDayClick }) {
  const dayNames = getDayNames();
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
    <div className="rounded-2xl glass overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/[0.05]">
        {dayNames.map(name => (
          <div key={name} className="mono-label text-center py-3">
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(({ date, day, isCurrentMonth, isToday }) => {
          const items = itemsByDate[date] || [];
          const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
          const overflow = items.length - MAX_VISIBLE_ITEMS;
          const isDragOver = dragOverDate === date;

          return (
            <div
              key={date}
              onDragOver={(e) => handleDragOver(e, date)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
              className="relative min-h-[110px] p-1.5 transition-colors"
              style={{
                borderRight: '1px solid rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isDragOver ? 'rgba(167,139,250,0.10)' : 'transparent',
                boxShadow: isDragOver ? 'inset 0 0 0 1.5px rgba(167,139,250,0.6)' : 'none',
                opacity: isCurrentMonth ? 1 : 0.35,
              }}
            >
              <button
                onClick={() => onDayClick?.(date)}
                className="font-mono text-[11px] mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors"
                style={
                  isToday
                    ? { background: 'rgb(var(--violet))', color: '#0a0a0f', boxShadow: '0 0 14px rgba(167,139,250,0.55)' }
                    : { color: isCurrentMonth ? 'rgb(var(--text-2))' : 'rgb(var(--text-3))' }
                }
              >
                {day}
              </button>

              <div className="space-y-0.5">
                {visibleItems.map(item => (
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
                {overflow > 0 && (
                  <button
                    onClick={() => onDayClick?.(date)}
                    className="font-mono text-[10.5px] text-violet-glow hover:text-violet pl-1.5"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
