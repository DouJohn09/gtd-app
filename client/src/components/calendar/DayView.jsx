import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import TaskCard from '../TaskCard';

export default function DayView({ date, tasks, onEditTask, onCompleteTask, onDropTask }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date);
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 min-h-[400px]
        ${isDragOver ? 'calendar-drop-target' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <CalendarDays className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium">No tasks scheduled</p>
          <p className="text-sm mt-1">Drag tasks here to schedule them for this day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={onCompleteTask}
              onEdit={onEditTask}
              showList
            />
          ))}
        </div>
      )}
    </div>
  );
}
