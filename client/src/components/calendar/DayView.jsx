import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import TaskCard from '../TaskCard';
import CalendarEventCard from '../CalendarEventCard';
import TimeGrid from './TimeGrid';

export default function DayView({ date, items, onEditTask, onCompleteTask, onDropTask, onUpdateTask }) {
  const [isAllDayDragOver, setIsAllDayDragOver] = useState(false);

  const timeBlocks = items.filter(i => i.type !== 'google_event' && i.scheduled_time);
  const allDayItems = items.filter(i => i.type === 'google_event' || !i.scheduled_time);

  const handleAllDayDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsAllDayDragOver(true);
  };
  const handleAllDayDrop = (e) => {
    e.preventDefault();
    setIsAllDayDragOver(false);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date, null);
  };

  return (
    <div className="rounded-2xl glass p-4">
      {/* All-day items */}
      <div
        onDragOver={handleAllDayDragOver}
        onDragLeave={() => setIsAllDayDragOver(false)}
        onDrop={handleAllDayDrop}
        className="rounded-xl p-3 mb-4 transition-colors"
        style={{
          background: isAllDayDragOver ? 'rgba(167,139,250,0.06)' : 'rgba(255,255,255,0.02)',
          boxShadow: isAllDayDragOver
            ? 'inset 0 0 0 1.5px rgba(167,139,250,0.6)'
            : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
          minHeight: '60px',
        }}
      >
        <div className="font-mono text-[10px] text-text-3 uppercase tracking-wider mb-2 px-1">all day</div>
        {allDayItems.length === 0 ? (
          <div className="font-mono text-[10.5px] text-text-3 text-center py-2">
            drop a task here for an all-day item
          </div>
        ) : (
          <div className="space-y-2">
            {allDayItems.map(item => (
              item.type === 'google_event' ? (
                <CalendarEventCard key={item.id} event={item} expanded />
              ) : (
                <TaskCard
                  key={item.id}
                  task={item}
                  onComplete={onCompleteTask}
                  onEdit={onEditTask}
                  showList
                />
              )
            ))}
          </div>
        )}
      </div>

      {/* Time grid */}
      <TimeGrid
        date={date}
        timeBlocks={timeBlocks}
        onDropTask={onDropTask}
        onEditTask={onEditTask}
        onCompleteTask={onCompleteTask}
        onUpdateTask={onUpdateTask}
      />

      {timeBlocks.length === 0 && allDayItems.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center text-center">
          <CalendarDays className="w-8 h-8 text-text-3 mb-2 opacity-40" />
          <div className="font-display italic text-[16px] text-text-3 opacity-60">A clean day.</div>
        </div>
      )}
    </div>
  );
}
