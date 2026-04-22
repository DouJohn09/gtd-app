import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon, Sparkles, Trash2, Clock, ChevronRight, Zap, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import MonoLabel from '../components/ui/MonoLabel';
import GlassCard from '../components/ui/GlassCard';

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function daysSince(iso) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function Inbox() {
  const [tasks, setTasks] = useState([]);
  const [deferredTasks, setDeferredTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort_inbox') || 'date_added_newest');
  const [showDeferred, setShowDeferred] = useState(() => localStorage.getItem('deferred_inbox') === 'true');
  const { addToast } = useToast();

  useEffect(() => { localStorage.setItem('sort_inbox', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('deferred_inbox', showDeferred); }, [showDeferred]);

  const fetchData = async () => {
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.tasks.getAll('inbox'),
        api.projects.getAll(),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
      if (showDeferred) {
        const deferred = await api.tasks.getDeferred('inbox');
        setDeferredTasks(deferred);
      } else {
        setDeferredTasks([]);
      }
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [showDeferred]);

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

  const capturedToday = useMemo(() => tasks.filter(t => isToday(t.created_at)).length, [tasks]);
  const oldestDays = useMemo(() => {
    if (!tasks.length) return 0;
    const oldest = tasks.reduce((min, t) => {
      if (!t.created_at) return min;
      return !min || t.created_at < min ? t.created_at : min;
    }, null);
    return daysSince(oldest);
  }, [tasks]);

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1400px]">
      {/* Headline */}
      {/* Headline */}
      <div className="mb-10 fresh-stagger">
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

      <div className="grid grid-cols-12 gap-5 fresh-stagger">
        {/* Left — capture + list */}
        <section className="col-span-12 xl:col-span-8 flex flex-col gap-5">
          {/* Quick capture */}
          <div className="rounded-2xl glass p-4">
            <QuickCapture onCapture={fetchData} />
          </div>

          {/* Controls bar */}
          {!loading && (
            <div className="flex items-center justify-between px-1">
              <div className="font-mono text-[11px] text-text-3 uppercase tracking-wider">
                {tasks.length > 0
                  ? `${sortedTasks.length} ${sortedTasks.length === 1 ? 'item' : 'items'} to process`
                  : 'inbox at zero'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDeferred(prev => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all"
                  style={
                    showDeferred
                      ? { background: 'rgb(var(--violet) / 0.14)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.28)' }
                      : { background: 'rgba(255,255,255,0.04)', color: 'rgb(var(--text-3))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }
                  }
                >
                  <CalendarClock className="w-2.5 h-2.5" />
                  Deferred{deferredTasks.length > 0 && showDeferred ? ` (${deferredTasks.length})` : ''}
                </button>
                <SortDropdown value={sortBy} onChange={setSortBy} />
              </div>
            </div>
          )}

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
          {showDeferred && deferredTasks.length > 0 && (
            <div className="mt-5">
              <div className="flex items-baseline gap-3 mb-3 px-1">
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
          )}
        </section>

        {/* Right rail */}
        <aside className="col-span-12 xl:col-span-4 flex flex-col gap-5">
          <ProcessingStatsCard
            count={tasks.length}
            capturedToday={capturedToday}
            oldestDays={oldestDays}
          />
          <ClarifyCard />
          <AIProcessCard inboxCount={tasks.length} />
        </aside>
      </div>

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

/* ============================================================ */

function ProcessingStatsCard({ count, capturedToday, oldestDays }) {
  const isZero = count === 0;
  return (
    <GlassCard>
      <MonoLabel tone="amber" className="mb-4">processing</MonoLabel>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[44px] leading-none tabular-nums">{count}</span>
        <span className="font-mono text-[12px] text-text-3">
          {count === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="font-mono text-[11px] text-text-3 mt-1.5">
        {isZero ? 'inbox at zero' : 'awaiting decision'}
      </div>

      <div className="mt-5 pt-4 border-t border-white/[0.05] grid grid-cols-2 gap-3">
        <div>
          <div className="font-display text-[22px] leading-none tabular-nums">{capturedToday}</div>
          <MonoLabel className="mt-1.5">captured today</MonoLabel>
        </div>
        <div>
          <div className="font-display text-[22px] leading-none tabular-nums inline-flex items-baseline gap-1">
            {oldestDays}
            <span className="font-mono text-[11px] text-text-3">d</span>
          </div>
          <MonoLabel className="mt-1.5">oldest item</MonoLabel>
        </div>
      </div>
    </GlassCard>
  );
}

function ClarifyCard() {
  return (
    <GlassCard className="relative overflow-hidden" padded={false}>
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--amber) / 0.18), transparent 70%)' }}
      />
      <div className="p-6 relative">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgb(var(--amber-glow))' }} />
          <MonoLabel tone="amber">clarify ritual</MonoLabel>
        </div>
        <p className="font-display italic text-[20px] leading-snug">
          Is it actionable?
        </p>
        <ul className="mt-3 space-y-2 text-[12.5px] text-text-2 leading-relaxed">
          <li className="flex gap-2">
            <span className="font-mono text-text-3 mt-0.5">01</span>
            <span>Under 2 minutes — <span className="text-text-1">do it now</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-3 mt-0.5">02</span>
            <span>Defer to <span className="font-mono text-mint-glow">next</span> or schedule it.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-3 mt-0.5">03</span>
            <span>Delegate to <span className="font-mono text-rose-glow">waiting</span>.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-3 mt-0.5">04</span>
            <span>Park in <span className="font-mono text-violet-glow">someday</span> or trash.</span>
          </li>
        </ul>
      </div>
    </GlassCard>
  );
}

function AIProcessCard({ inboxCount }) {
  return (
    <GlassCard className="relative overflow-hidden" padded={false}>
      <div
        className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--violet) / 0.18), transparent 70%)' }}
      />
      <div className="p-5 relative">
        <div className="flex items-center gap-2 mb-2.5">
          <Zap className="w-3.5 h-3.5" style={{ color: 'rgb(var(--violet-glow))' }} />
          <MonoLabel tone="violet">ai assist</MonoLabel>
        </div>
        {inboxCount > 0 ? (
          <>
            <div className="text-[13.5px] leading-snug">
              Let AI categorize, set contexts, and propose due dates for{' '}
              <span className="font-mono text-text-1">{inboxCount}</span>{' '}
              {inboxCount === 1 ? 'item' : 'items'} in one pass.
            </div>
            <div className="mt-3.5">
              <Link
                to="/ai"
                className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                style={{ background: 'rgb(var(--violet) / 0.14)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)' }}
              >
                <Sparkles className="w-3 h-3" /> Process with AI
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="text-[13.5px] leading-snug">
              <span className="font-display italic text-mint-glow">Caught up.</span>{' '}
              When new items land here, AI can clarify them in seconds.
            </div>
            <div className="mt-3.5 flex items-center gap-1.5 font-mono text-[10.5px] text-text-3">
              <Clock className="w-3 h-3" />
              ready when you are
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
