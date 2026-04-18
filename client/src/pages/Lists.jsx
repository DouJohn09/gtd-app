import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTodo, Clock, CloudSun, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import MonoLabel from '../components/ui/MonoLabel';

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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('priority');
  const { addToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.tasks.getAll(list),
        api.projects.getAll(),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
    } catch (err) {
      console.error('Failed to load list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [list]);

  const handleComplete = async (id) => {
    try { await api.tasks.complete(id); addToast('Task completed', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return;
    try { await api.tasks.delete(id); addToast('Deleted', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);

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
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <MonoLabel tone={tone} className="mb-3">{config.eyebrow}</MonoLabel>
          <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">
            {config.title}
            <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
              {tasks.length.toString().padStart(2, '0')}
            </span>
          </h1>
          <p className="font-display italic text-[18px] text-text-2 mt-2">
            {config.tagline}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SortDropdown value={sortBy} onChange={setSortBy} />
          <button
            onClick={() => { setEditingTask({ list }); setShowModal(true); }}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px]"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
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
                      onClick={() => handleDelete(task.id)}
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
                onClick={() => handleDelete(task.id)}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-text-3 hover:text-rose-glow transition-all"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
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
    </div>
  );
}
