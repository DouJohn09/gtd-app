import { useState, useRef } from 'react';
import { Flame, Pencil, Trash2, Calendar } from 'lucide-react';

export default function HabitCard({ habit, onToggle, onEdit, onDelete }) {
  const dateInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];

  const handleDateChange = (e) => {
    const date = e.target.value;
    if (date) {
      onToggle(habit.id, date);
      e.target.value = '';
    }
  };

  return (
    <div className="gtd-card flex items-center gap-3">
      <button
        onClick={() => onToggle(habit.id)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          habit.completed_today
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
        }`}
      >
        {habit.completed_today && (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`font-medium ${habit.completed_today ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}
          >
            {habit.name}
          </span>
          {habit.category && (
            <span
              className="gtd-badge text-xs"
              style={{ backgroundColor: habit.color + '20', color: habit.color }}
            >
              {habit.category}
            </span>
          )}
        </div>
        {habit.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{habit.description}</p>
        )}
      </div>

      {habit.streak > 0 && (
        <div className="flex items-center gap-1 text-orange-500 text-sm font-medium flex-shrink-0">
          <Flame className="w-4 h-4" />
          {habit.streak}
        </div>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
            className="text-gray-400 hover:text-blue-500 p-1"
            title="Log for another date"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            max={today}
            onChange={handleDateChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            tabIndex={-1}
          />
        </div>
        <button onClick={() => onEdit(habit)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(habit.id)} className="text-gray-400 hover:text-red-500 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
