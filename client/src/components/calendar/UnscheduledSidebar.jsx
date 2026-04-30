import { useState, useMemo } from 'react';
import { Calendar, X } from 'lucide-react';
import CalendarTaskCard from '../CalendarTaskCard';
import FilterDropdown, { useTaskFilters, applyFilters } from '../FilterDropdown';

const LIST_FILTERS = [
  { value: '',              label: 'all'      },
  { value: 'inbox',         label: 'inbox'    },
  { value: 'next_actions',  label: 'next'     },
  { value: 'waiting_for',   label: 'waiting'  },
  { value: 'someday_maybe', label: 'someday'  },
];

const TONE_BY_FILTER = {
  inbox: 'amber',
  next_actions: 'mint',
  waiting_for: 'rose',
  someday_maybe: 'violet',
};

export default function UnscheduledSidebar({ tasks, onEditTask, onCompleteTask, isOpen, onToggle }) {
  const [filter, setFilter] = useState('');
  const [filterContext, setFilterContext] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const { contexts: sidebarContexts, projects: sidebarProjects } = useTaskFilters(tasks);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filter) result = result.filter(t => t.list === filter);
    return applyFilters(result, { context: filterContext, project: filterProject });
  }, [tasks, filter, filterContext, filterProject]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <div className="mono-label">unscheduled</div>
          <span className="font-mono text-[11px] text-text-2">{filteredTasks.length}</span>
        </div>
        <button
          onClick={onToggle}
          className="md:hidden grid place-items-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {LIST_FILTERS.map(f => {
          const active = filter === f.value;
          const tone = TONE_BY_FILTER[f.value];
          return (
            <button
              key={f.value || 'all'}
              onClick={() => setFilter(f.value)}
              className="font-mono text-[10.5px] px-2 py-1 rounded-md transition-all"
              style={
                active
                  ? {
                      background: tone ? `rgb(var(--${tone}) / 0.14)` : 'rgba(255,255,255,0.08)',
                      color: tone ? `rgb(var(--${tone}-glow))` : 'rgb(var(--text-1))',
                      border: `1px solid ${tone ? `rgb(var(--${tone}) / 0.3)` : 'rgba(255,255,255,0.16)'}`,
                    }
                  : {
                      color: 'rgb(var(--text-3))',
                      border: '1px solid transparent',
                    }
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <FilterDropdown label="Context" options={sidebarContexts} value={filterContext} onChange={setFilterContext} />
        <FilterDropdown label="Project" options={sidebarProjects} value={filterProject} onChange={setFilterProject} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-10">
            <Calendar className="w-7 h-7 mx-auto mb-2 text-text-3" />
            <p className="font-mono text-[10.5px] text-text-3">no_unscheduled_tasks</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <CalendarTaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onComplete={onCompleteTask}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-72 flex-shrink-0 self-start sticky top-4 max-h-[calc(100vh-120px)] overflow-hidden flex-col rounded-2xl glass p-4">
        {sidebar}
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <>
          <div className="md:hidden fixed inset-0 backdrop-blur-md z-40" style={{ background: 'rgba(8,8,14,0.55)' }} onClick={onToggle} />
          <div className="md:hidden fixed right-0 top-0 bottom-0 w-80 z-50 animate-slide-in p-3">
            <div className="h-full rounded-2xl glass p-4 shadow-glass-lg">
              {sidebar}
            </div>
          </div>
        </>
      )}
    </>
  );
}
