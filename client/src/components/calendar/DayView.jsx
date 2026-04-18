import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import TaskCard from '../TaskCard';
import CalendarEventCard from '../CalendarEventCard';

export default function DayView({ date, items, onEditTask, onCompleteTask, onDropTask }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="rounded-2xl glass p-6 min-h-[440px] transition-colors"
      style={{
        background: isDragOver ? 'rgba(167,139,250,0.06)' : undefined,
        boxShadow: isDragOver
          ? '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgba(167,139,250,0.6)'
          : undefined,
      }}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center relative">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 50% 40%, rgba(167,139,250,0.08), transparent 60%)' }}
          />
          <CalendarDays className="w-10 h-10 text-text-3 mb-4" />
          <div className="font-mono text-[11px] text-text-3 mb-2">no_tasks_scheduled</div>
          <div className="font-display italic text-[20px] mb-1">A clean day.</div>
          <p className="text-[12.5px] text-text-2">Drag any task here to schedule it.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map(item => (
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
  );
}
