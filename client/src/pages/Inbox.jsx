import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon, Sparkles, Trash2, Clock, ChevronRight, Zap, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import { useTaskFilters, applyFilters } from '../components/FilterDropdown';
import FiltersMenu, { ActiveFilters } from '../components/FiltersMenu';
import InboxProcessPanel from '../components/InboxProcessPanel';
import MonoLabel from '../components/ui/MonoLabel';
import GlassCard from '../components/ui/GlassCard';
import ConfirmModal from '../components/ui/ConfirmModal';
import { formatCompletionToast } from '../lib/dateUtils';

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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort_inbox') || 'date_added_newest');
  const [showDeferred, setShowDeferred] = useState(() => localStorage.getItem('deferred_inbox') === 'true');
  const [filterContext, setFilterContext] = useState(() => localStorage.getItem('filter_context_inbox') || '');
  const [filterProject, setFilterProject] = useState(() => localStorage.getItem('filter_project_inbox') || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiKept, setAiKept] = useState(() => new Set());
  const [applying, setApplying] = useState(false);
  const { addToast } = useToast();

  useEffect(() => { localStorage.setItem('sort_inbox', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('deferred_inbox', showDeferred); }, [showDeferred]);
  useEffect(() => { localStorage.setItem('filter_context_inbox', filterContext); }, [filterContext]);
  useEffect(() => { localStorage.setItem('filter_project_inbox', filterProject); }, [filterProject]);

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

  useEffect(() => {
    fetchData();
    const onCapture = () => fetchData();
    window.addEventListener('task-captured', onCapture);
    return () => window.removeEventListener('task-captured', onCapture);
  }, [showDeferred]);

  const handleComplete = async (id) => {
    try {
      const updated = await api.tasks.complete(id);
      addToast(formatCompletionToast(updated, 'Processed'), 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };
  const handleDelete = async (id) => {
    setConfirmDeleteId(null);
    try { await api.tasks.delete(id); addToast('Deleted', 'success'); fetchData(); }
    catch (err) { addToast(err.message, 'error'); }
  };

  const runProcessInbox = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const result = await api.ai.processInbox();
      const items = result?.processed_items || [];
      if (!items.length) {
        setAiResult(null);
        addToast('AI found nothing to process.', 'info');
        return;
      }
      setAiResult(result);
      setAiKept(new Set(items.map(it => it.original_index)));
    } catch (err) {
      console.error('Process inbox failed:', err);
      addToast(err?.message?.includes('limit') ? 'Daily AI limit reached.' : 'Could not process inbox.', 'error');
    } finally {
      setAiLoading(false);
    }
  };
  const toggleAiKept = (idx) => setAiKept(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });
  const cancelProcessing = () => { setAiResult(null); setAiKept(new Set()); };
  const applyProcessing = async () => {
    if (!aiResult?.processed_items) return;
    setApplying(true);
    try {
      const items = aiResult.processed_items
        .filter(it => aiKept.has(it.original_index))
        .map(it => ({ task_id: aiResult.tasks[it.original_index - 1]?.id, ...it }))
        .filter(it => it.task_id);
      await api.ai.applyInboxProcessing(items);
      addToast(`Processed ${items.length} ${items.length === 1 ? 'item' : 'items'}.`, 'success');
      setAiResult(null);
      setAiKept(new Set());
      fetchData();
    } catch (err) {
      console.error('Apply inbox processing failed:', err);
      addToast('Could not apply changes.', 'error');
    } finally {
      setApplying(false);
    }
  };

  const { contexts: inboxContexts, projects: inboxProjects } = useTaskFilters(tasks);
  const inboxToggles = [
    {
      key: 'deferred',
      label: 'Show deferred tasks',
      activeLabel: deferredTasks.length > 0 ? `Deferred shown (${deferredTasks.length})` : 'Deferred shown',
      active: showDeferred,
      onToggle: () => setShowDeferred(v => !v),
      icon: CalendarClock,
    },
  ];
  const inboxFilters = [
    { key: 'context', label: 'Context', options: inboxContexts, value: filterContext, onChange: setFilterContext, renderValue: v => `@${v}` },
    { key: 'project', label: 'Project', options: inboxProjects, value: filterProject, onChange: setFilterProject },
  ];
  const sortedTasks = useMemo(
    () => sortTasks(applyFilters(tasks, { context: filterContext, project: filterProject }), sortBy),
    [tasks, sortBy, filterContext, filterProject],
  );

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
            <div>
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="font-mono text-[11px] text-text-3 uppercase tracking-wider">
                  {tasks.length > 0
                    ? `${sortedTasks.length} ${sortedTasks.length === 1 ? 'item' : 'items'} to process`
                    : 'inbox at zero'}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <FiltersMenu toggles={inboxToggles} filters={inboxFilters} />
                  <SortDropdown value={sortBy} onChange={setSortBy} compact />
                  {tasks.length > 0 && (
                    <button
                      onClick={runProcessInbox}
                      disabled={aiLoading || !!aiResult}
                      title="AI — sort & categorize the inbox"
                      aria-label="AI process inbox"
                      className="gtd-btn gtd-btn-primary !px-2.5 !py-1.5 grid place-items-center disabled:opacity-70"
                    >
                      {aiLoading
                        ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        : <Sparkles className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
              <ActiveFilters toggles={inboxToggles} filters={inboxFilters} className="mt-3 px-1" />
            </div>
          )}

          {aiResult && (
            <InboxProcessPanel
              result={aiResult}
              kept={aiKept}
              onToggleKept={toggleAiKept}
              onApply={applyProcessing}
              onCancel={cancelProcessing}
              applying={applying}
            />
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
        </section>

        {/* Right rail */}
        <aside className="col-span-12 xl:col-span-4 flex flex-col gap-5">
          <ProcessingStatsCard
            count={tasks.length}
            capturedToday={capturedToday}
            oldestDays={oldestDays}
          />
          <ClarifyCard />
          <AIProcessCard
            inboxCount={tasks.length}
            onProcess={runProcessInbox}
            loading={aiLoading}
            disabled={!!aiResult}
          />
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

function AIProcessCard({ inboxCount, onProcess, loading, disabled }) {
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
              <button
                onClick={onProcess}
                disabled={loading || disabled}
                className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: 'rgb(var(--violet) / 0.14)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)' }}
              >
                {loading
                  ? <span className="w-3 h-3 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                Process with AI
              </button>
              <div className="mt-2">
                <Link to="/ai" className="font-mono text-[10.5px] text-text-3 hover:text-text-1 inline-flex items-center gap-1 transition-colors">
                  open AI Assistant <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
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
