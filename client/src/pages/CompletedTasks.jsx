import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, RotateCcw, Trash2, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import MonoLabel from '../components/ui/MonoLabel';

function TaskRow({ task, onRestore, onDelete }) {
  return (
    <div className="rounded-2xl glass p-4 flex items-center gap-3 group transition-all">
      <div
        className="grid place-items-center w-7 h-7 rounded-full flex-shrink-0"
        style={{
          background: 'linear-gradient(180deg, rgb(var(--mint) / 0.85), rgb(var(--mint) / 0.65))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 12px rgb(var(--mint) / 0.3)',
        }}
      >
        <Check className="w-3.5 h-3.5 text-bg" strokeWidth={3} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] text-text-2 line-through truncate">{task.title}</p>
        {task.context && (
          <span className="font-mono text-[10.5px] text-text-3">@{task.context}</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onRestore(task.id)}
          className="p-1.5 text-text-3 hover:text-violet-glow rounded-lg transition-colors"
          title="Restore to inbox"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 text-text-3 hover:text-rose-glow rounded-lg transition-colors"
          title="Delete permanently"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function CompletedTasks() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort_completed') || 'completed_newest');

  useEffect(() => { localStorage.setItem('sort_completed', sortBy); }, [sortBy]);

  const fetchData = async () => {
    try {
      const data = await api.tasks.getAll('completed');
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch completed tasks:', error);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRestore = async (id) => {
    try {
      await api.tasks.update(id, { list: 'inbox', completed_at: null });
      addToast('Task restored to inbox', 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Permanently delete this task?')) return;
    try {
      await api.tasks.delete(id);
      addToast('Task deleted', 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);

  const grouped = sortedTasks.reduce((acc, task) => {
    const date = task.completed_at ? task.completed_at.split('T')[0] : 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="px-6 lg:px-12 pt-10 pb-20">
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <MonoLabel tone="mint" className="mb-3">archive</MonoLabel>
          <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">
            Completed
            <span className="font-mono text-[14px] tracking-wider text-text-3 ml-3 align-middle">
              {tasks.length.toString().padStart(2, '0')}
            </span>
          </h1>
          <p className="font-display italic text-[18px] text-text-2 mt-2">
            {tasks.length === 0 ? 'Nothing finished yet — soon.' : 'A history of things shipped.'}
          </p>
        </div>
        {tasks.length > 0 && (
          <SortDropdown value={sortBy} onChange={setSortBy} completed />
        )}
      </div>

      {tasks.length === 0 ? (
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
              <CheckCircle2 className="w-6 h-6" style={{ color: 'rgb(var(--mint-glow))' }} />
            </div>
            <div className="mono-label mb-2" style={{ color: 'rgb(var(--mint-glow))' }}>archive_empty</div>
            <div className="font-display italic text-[28px] mb-1">A blank ledger.</div>
            <p className="text-[13px] text-text-2">Tasks you complete will land here.</p>
          </div>
        </div>
      ) : sortBy.startsWith('completed_') ? (
        <div className="space-y-7">
          {Object.entries(grouped).map(([date, dateTasks]) => (
            <div key={date}>
              <div className="flex items-baseline gap-3 mb-3 px-1">
                <div className="mono-label">{formatDate(date + 'T00:00:00').toLowerCase().replace(/\s+/g, '_')}</div>
                <span className="font-mono text-[10.5px] text-text-3">{date}</span>
                <span className="font-mono text-[10.5px] text-text-3">·</span>
                <span className="font-mono text-[10.5px] text-mint-glow">
                  {dateTasks.length.toString().padStart(2, '0')}
                </span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.06), transparent)' }} />
              </div>
              <div className="space-y-2">
                {dateTasks.map(task => (
                  <TaskRow key={task.id} task={task} onRestore={handleRestore} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map(task => (
            <TaskRow key={task.id} task={task} onRestore={handleRestore} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
