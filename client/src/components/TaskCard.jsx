import { CheckCircle, Circle, Clock, Zap, Tag, FolderOpen } from 'lucide-react';

const energyColors = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-red-600'
};

export default function TaskCard({ task, onComplete, onEdit, showList = false, queued = false }) {
  const isCompleted = task.list === 'completed';

  return (
    <div className={`gtd-card flex items-start gap-3 overflow-hidden ${isCompleted ? 'opacity-60' : ''} ${queued ? 'opacity-50 border-dashed' : ''}`}>
      <button
        onClick={() => onComplete?.(task.id)}
        className={`mt-0.5 transition-colors ${queued ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-green-600'}`}
        disabled={isCompleted || queued}
      >
        {isCompleted ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <Circle className={`w-5 h-5 ${queued ? 'text-gray-300 dark:text-gray-600' : ''}`} />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <div 
          className={`font-medium cursor-pointer hover:text-blue-600 break-words ${isCompleted ? 'line-through' : ''}`}
          onClick={() => onEdit?.(task)}
        >
          {task.title}
        </div>
        
        {task.notes && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{task.notes}</p>
        )}
        
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {showList && (
            <span className={`gtd-badge list-${task.list}`}>
              {task.list.replace('_', ' ')}
            </span>
          )}
          
          {task.context && (
            <span className="context-badge">
              <Tag className="w-3 h-3 mr-1" />
              {task.context}
            </span>
          )}
          
          {task.project_name && (
            <span className="gtd-badge bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">
              <FolderOpen className="w-3 h-3 mr-1" />
              {task.project_name}
            </span>
          )}
          
          {task.energy_level && (
            <span className={`flex items-center gap-1 text-xs ${energyColors[task.energy_level]}`}>
              <Zap className="w-3 h-3" />
              {task.energy_level}
            </span>
          )}
          
          {task.time_estimate && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              {task.time_estimate}m
            </span>
          )}
          
          {task.waiting_for_person && (
            <span className="text-xs text-orange-600">
              Waiting: {task.waiting_for_person}
            </span>
          )}
        </div>
      </div>
      
      {queued && (
        <span className="gtd-badge bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-xs">
          Queued
        </span>
      )}
      {task.is_daily_focus === 1 && !queued && (
        <span className="gtd-badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
          Today
        </span>
      )}
    </div>
  );
}
