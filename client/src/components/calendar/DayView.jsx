import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import TaskCard from '../TaskCard';
import CalendarEventCard from '../CalendarEventCard';
import TimeGrid from './TimeGrid';

function googleEventToBlock(event) {
  if (event.all_day || !event.start_time) return null;
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const scheduled_time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const duration = end ? Math.max(15, Math.round((end - start) / 60000)) : 60;
  return { ...event, scheduled_time, duration };
}

export default function DayView({ date, items, onEditTask, onCompleteTask, onDropTask, onUpdateTask }) {
  const [isAllDayDragOver, setIsAllDayDragOver] = useState(false);

  const timeBlocks = items.flatMap(i => {
    if (i.type === 'google_event') {
      const block = googleEventToBlock(i);
      return block ? [block] : [];
    }
    return i.scheduled_time ? [i] : [];
  });
  const allDayItems = items.filter(i =>
    i.type === 'google_event' ? i.all_day : !i.scheduled_time
  );

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
                <div
                  key={item.id}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.id.toString());
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{ cursor: 'grab' }}
                >
                  <TaskCard
                    task={item}
                    onComplete={onCompleteTask}
                    onEdit={onEditTask}
                    showList
                  />
                </div>
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
