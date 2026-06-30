import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTodo, Clock, CloudSun, Plus, Trash2, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import { useTaskFilters, applyFilters } from '../components/FilterDropdown';
import FiltersMenu, { ActiveFilters } from '../components/FiltersMenu';
import MonoLabel from '../components/ui/MonoLabel';
import ConfirmModal from '../components/ui/ConfirmModal';
import { formatCompletionToast } from '../lib/dateUtils';

const LIST_CONFIG = {
  next_actions: {
    title: 'Next Actions',
    eyebrow: 'do',
    icon: ListTodo,
    tone: 'mint',
    tagline: 'Clear, physical actions you can take right now.',
    empty: 'no_next_actions',
    emptyTagline: 'Nothing to do.',
  },
  waiting_for: {
    title: 'Waiting For',
    eyebrow: 'delegated',
    icon: Clock,
    tone: 'rose',
    tagline: 'Items handed off — track until they land.',
    empty: 'nothing_pending',
    emptyTagline: 'No open loops with anyone else.',
  },
  someday_maybe: {
    title: 'Someday / Maybe',
    eyebrow: 'incubate',
    icon: CloudSun,
    tone: 'violet',
    tagline: 'Ideas to revisit when the season is right.',
    empty: 'no_ideas_parked',
    emptyTagline: 'Nothing parked for later.',
  },
};

export default function Lists() {
  const { list } = useParams();
  const config = LIST_CONFIG[list] || LIST_CONFIG.next_actions;
  const Icon = config.icon;
  const tone = config.tone;

  const [tasks, setTasks] = useState([]);
  const [deferredTasks, setDeferredTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(`sort_list_${list}`) || 'priority');
  const [showDeferred, setShowDeferred] = useState(() => localStorage.getItem(`deferred_list_${list}`) === 'true');
  const [filterContext, setFilterContext] = useState(() => localStorage.getItem(`filter_context_list_${list}`) || '');
  const [filterProject, setFilterProject] = useState(() => localStorage.getItem(`filter_project_list_${list}`) || '');
  const { addToast } = useToast();

  // Per-list scoping for all view state — each list (next_actions, waiting_for,
  // someday_maybe) keeps its own sort/filter/deferred-toggle settings.
  useEffect(() => {
    setSortBy(localStorage.getItem(`sort_list_${list}`) || 'priority');
    setFilterContext(localStorage.getItem(`filter_context_list_${list}`) || '');
    setFilterProject(localStorage.getItem(`filter_project_list_${list}`) || '');
  }, [list]);
  useEffect(() => { localStorage.setItem(`sort_list_${list}`, sortBy); }, [sortBy, list]);
  useEffect(() => { setShowDeferred(localStorage.getItem(`deferred_list_${list}`) === 'true'); }, [list]);
  useEffect(() => { localStorage.setItem(`deferred_list_${list}`, showDeferred); }, [showDeferred, list]);
  useEffect(() => { localStorage.setItem(`filter_context_list_${list}`, filterContext); }, [filterContext, list]);
  useEffect(() => { localStorage.setItem(`filter_project_list_${list}`, filterProject); }, [filterProject, list]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.tasks.getAll(list),
        api.projects.getAll(),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
      if (showDeferred) {
        const deferred = await api.tasks.getDeferred(list);
        setDeferredTasks(deferred);
      } else {
        setDeferredTasks([]);
      }
    } catch (err) {
      console.error('Failed to load list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const onCapture = () => fetchData();
    window.addEventListener('task-captured', onCapture);
    return () => window.removeEventListener('task-captured', onCapture);
  }, [list, showDeferred]);

  const toggleDeferred = () => setShowDeferred(prev => !prev);

  const handleComplete = async (id) => {
    try {
      const updated = await api.tasks.complete(id);
      addToast(formatCompletionToast(updated, 'Task completed'), 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleDelete = async (id) => {
    setConfirmDeleteId(null);
    try { await api.tasks.delete(id); addToast('Deleted', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };

  const { contexts: listContexts, projects: listProjects } = useTaskFilters(tasks);
  const sortedTasks = useMemo(
    () => sortTasks(applyFilters(tasks, { context: filterContext, project: filterProject }), sortBy),
    [tasks, sortBy, filterContext, filterProject],
  );

  const listToggles = [
    {
      key: 'deferred',
      label: 'Show deferred tasks',
      activeLabel: deferredTasks.length > 0 ? `Deferred shown (${deferredTasks.length})` : 'Deferred shown',
      active: showDeferred,
      onToggle: toggleDeferred,
      icon: CalendarClock,
    },
  ];
  const listFilters = [
    { key: 'context', label: 'Context', options: listContexts, value: filterContext, onChange: setFilterContext, renderValue: v => `@${v}` },
    { key: 'project', label: 'Project', options: listProjects, value: filterProject, onChange: setFilterProject },
  ];

  const groupedByContext =
    list === 'next_actions' && sortBy === 'priority'
      ? sortedTasks.reduce((acc, task) => {
          const ctx = task.context || 'No Context';
          if (!acc[ctx]) acc[ctx] = [];
          acc[ctx].push(task);
          return acc;
        }, {})
      : null;

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between gap-4 mb-2">
          <div>
            <MonoLabel tone={tone} className="mb-3">{config.eyebrow}</MonoLabel>
            <h1 className="font-display text-[46px] md:text-[56px] leading-[1] tracking-tight">
              {config.title}
              <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
                {tasks.length.toString().padStart(2, '0')}
              </span>
            </h1>
            <p className="font-display italic text-[18px] text-text-2 mt-2">
              {config.tagline}
            </p>
          </div>
          <button
            onClick={() => { setEditingTask({ list }); setShowModal(true); }}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px] flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        <div className="flex items-center gap-2">
          <FiltersMenu toggles={listToggles} filters={listFilters} />
          <SortDropdown value={sortBy} onChange={setSortBy} compact />
        </div>
        <ActiveFilters toggles={listToggles} filters={listFilters} className="mt-3" />
      </div>

      {/* Body */}
      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="rounded-2xl glass p-10 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 30%, rgb(var(--${tone}) / 0.10), transparent 60%)` }}
          />
          <div className="relative">
            <div
              className="inline-grid place-items-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: `rgb(var(--${tone}) / 0.10)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.25)` }}
            >
              <Icon className="w-6 h-6" style={{ color: `rgb(var(--${tone}-glow))` }} />
            </div>
            <div className="mono-label mb-2" style={{ color: `rgb(var(--${tone}-glow))` }}>{config.empty}</div>
            <div className="font-display italic text-[28px] mb-1">{config.emptyTagline}</div>
            <p className="text-[13px] text-text-2">Add an item to get started.</p>
          </div>
        </div>
      ) : groupedByContext ? (
        <div className="space-y-7">
          {Object.entries(groupedByContext).map(([context, contextTasks]) => (
            <div key={context}>
              <div className="flex items-baseline gap-3 mb-3">
                <div className="mono-label">{context.toLowerCase().replace(/\s+/g, '_')}</div>
                <span className="font-mono text-[10.5px] text-text-3">
                  {contextTasks.length.toString().padStart(2, '0')}
                </span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
              </div>
              <div className="space-y-3">
                {contextTasks.map(task => (
                  <div key={task.id} className="group relative">
                    <TaskCard task={task} onComplete={handleComplete} onEdit={handleEdit} />
                    <button
                      onClick={() => setConfirmDeleteId(task.id)}
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-text-3 hover:text-rose-glow transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map(task => (
            <div key={task.id} className="group relative">
              <TaskCard task={task} onComplete={handleComplete} onEdit={handleEdit} />
              <button
                onClick={() => setConfirmDeleteId(task.id)}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-text-3 hover:text-rose-glow transition-all"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showDeferred && deferredTasks.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline gap-3 mb-3">
            <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>
              <CalendarClock className="w-3 h-3 inline mr-1.5" />
              deferred
            </div>
            <span className="font-mono text-[10.5px] text-text-3">
              {deferredTasks.length.toString().padStart(2, '0')}
            </span>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgb(var(--violet) / 0.15), transparent)' }} />
          </div>
          <div className="space-y-3">
            {deferredTasks.map(task => (
              <div key={task.id} className="group relative" style={{ opacity: 0.6 }}>
                <TaskCard task={task} onComplete={handleComplete} onEdit={handleEdit} />
                <button
                  onClick={() => setConfirmDeleteId(task.id)}
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-text-3 hover:text-rose-glow transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editingTask}
          projects={projects}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={fetchData}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete this task?"
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
