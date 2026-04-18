import { useState, useEffect, useMemo } from 'react';
import { Inbox as InboxIcon, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import MonoLabel from '../components/ui/MonoLabel';

export default function Inbox() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('date_added_newest');
  const { addToast } = useToast();

  const fetchData = async () => {
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.tasks.getAll('inbox'),
        api.projects.getAll(),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleComplete = async (id) => {
    try { await api.tasks.complete(id); addToast('Processed', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };
  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return;
    try { await api.tasks.delete(id); addToast('Deleted', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <MonoLabel tone="amber" className="mb-3">capture</MonoLabel>
        <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">
          Inbox
          <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
            {tasks.length.toString().padStart(2, '0')}
          </span>
        </h1>
        <p className="font-display italic text-[18px] text-text-2 mt-2">
          Get it out of your head. Process later.
        </p>
      </div>

      {/* Quick capture */}
      <div className="rounded-2xl glass p-4 mb-5">
        <QuickCapture onCapture={fetchData} />
      </div>

      {/* GTD tip card */}
      <div
        className="relative rounded-2xl glass p-5 mb-7 overflow-hidden"
        style={{ boxShadow: '0 8px 32px -12px rgba(0,0,0,0.45), inset 0 1px 0 rgb(255 255 255 / 0.04), inset 0 0 0 1px rgb(var(--amber) / 0.18)' }}
      >
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(var(--amber) / 0.18), transparent 70%)' }}
        />
        <div className="flex items-start gap-3 relative">
          <div
            className="grid place-items-center w-9 h-9 rounded-xl flex-shrink-0"
            style={{ background: 'rgb(var(--amber) / 0.12)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.25)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--amber-glow))' }} />
          </div>
          <div className="flex-1">
            <div className="mono-label" style={{ color: 'rgb(var(--amber-glow))' }}>processing_ritual</div>
            <p className="font-display italic text-[18px] mt-1.5 leading-snug">
              Is it actionable?
            </p>
            <p className="text-[13px] text-text-2 mt-1.5 leading-relaxed">
              If yes &amp; under 2 minutes — do it now. Otherwise delegate, defer to <span className="font-mono text-[12px] text-mint-glow">next</span>, or park in <span className="font-mono text-[12px] text-violet-glow">someday</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl glass p-10 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 50% 30%, rgb(var(--mint) / 0.10), transparent 60%)' }}
          />
          <div className="relative">
            <div
              className="inline-grid place-items-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: 'rgb(var(--mint) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)' }}
            >
              <InboxIcon className="w-6 h-6" style={{ color: 'rgb(var(--mint-glow))' }} />
            </div>
            <div className="mono-label mb-2" style={{ color: 'rgb(var(--mint-glow))' }}>inbox_zero</div>
            <div className="font-display italic text-[28px] mb-1">A clear mind.</div>
            <p className="text-[13px] text-text-2">Capture new items above.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="font-mono text-[11px] text-text-3 uppercase tracking-wider">
              {sortedTasks.length} {sortedTasks.length === 1 ? 'item' : 'items'} to process
            </div>
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>

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
