import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, ListTodo, Clock, CloudSun, CheckCircle2, Target, Sparkles,
  ArrowUpRight, ChevronRight, Flame, EyeOff, X, CalendarClock,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { isOverdue, formatCompletionToast } from '../lib/dateUtils';
import { contextLabel } from '../lib/context';
import { listLabel } from '../lib/listLabel';
import { linkify } from '../lib/linkify.jsx';
import { useToast } from '../components/Toast';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';
import { useTaskFilters, applyFilters } from '../components/FilterDropdown';
import FiltersMenu, { ActiveFilters } from '../components/FiltersMenu';
import { useAiFocus, partitionByAi } from '../hooks/useAiFocus';
import { useAiMode } from '../hooks/useAiMode';
import { aiToast } from '../lib/aiError';
import PlanReviewPanel from '../components/PlanReviewPanel';
import DayBrief from '../components/DayBrief';
import GlassCard from '../components/ui/GlassCard';
import Chip from '../components/ui/Chip';
import FreshCheck from '../components/ui/FreshCheck';
import MonoLabel from '../components/ui/MonoLabel';

const TONE_BY_LIST = {
  inbox: 'amber',
  next_actions: 'mint',
  waiting_for: 'rose',
  someday_maybe: 'violet',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toLowerCase();
}

function firstName(user) {
  if (!user?.name) return '';
  return user.name.split(/\s+/)[0];
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const wordifyCount = (n) => (n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [dailyFocus, setDailyFocus] = useState([]);
  const [habits, setHabits] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort_focus') || 'priority');
  const [filterContext, setFilterContext] = useState(() => localStorage.getItem('filter_context_focus') || '');
  const [filterProject, setFilterProject] = useState(() => localStorage.getItem('filter_project_focus') || '');
  const [hideOverdue, setHideOverdue] = useState(() => localStorage.getItem('hide_overdue_focus') === 'true');
  const { user } = useAuth();
  const { aiOff } = useAiMode();
  const { addToast } = useToast();
  const { aiLoading, aiResult, run: runAiSuggest, clear: clearAiSuggest } = useAiFocus(dailyFocus, addToast);
  const [planResult, setPlanResult] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [briefBump, setBriefBump] = useState(0);

  const runPlanDay = async () => {
    setPlanLoading(true);
    try {
      const result = await api.ai.planDay();
      if ((result.plan || []).length === 0 && (result.deferred || []).length === 0) {
        addToast(result.summary || 'Nothing to plan right now.', 'info');
      } else {
        setPlanResult(result);
      }
    } catch (err) {
      // 402 limit_reached already opened the global upgrade prompt.
      if (err.code !== 'limit_reached') addToast(...aiToast(err, 'Could not plan the day. Try again in a moment.'));
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => { localStorage.setItem('hide_overdue_focus', hideOverdue); }, [hideOverdue]);
  useEffect(() => { localStorage.setItem('sort_focus', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('filter_context_focus', filterContext); }, [filterContext]);
  useEffect(() => { localStorage.setItem('filter_project_focus', filterProject); }, [filterProject]);

  const fetchData = async () => {
    try {
      const [statsData, focusData, habitsData, projectsData] = await Promise.all([
        api.tasks.getStats(),
        api.tasks.getDailyFocus(),
        api.habits.getAll(),
        api.projects.getAll(),
      ]);
      setStats(statsData);
      setDailyFocus(focusData);
      setHabits(habitsData);
      setProjects(projectsData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const onCapture = () => fetchData();
    window.addEventListener('task-captured', onCapture);
    return () => window.removeEventListener('task-captured', onCapture);
  }, []);

  const handleComplete = async (id) => {
    // Optimistic: flip the check immediately so the animation plays before refetch.
    setDailyFocus(prev => prev.map(t => t.id === id ? { ...t, completed: true } : t));
    try {
      const updated = await api.tasks.complete(id);
      // Existing Dashboard UX is silent on completion — keep it that way for
      // one-shots so the animation isn't drowned by toast noise. Surface a
      // toast ONLY for recurring tasks, where the silent next-occurrence is
      // exactly the trap we're trying to prevent.
      if (updated?.recurrence_rule && updated?.due_date) {
        addToast(formatCompletionToast(updated), 'success');
      }
      setTimeout(fetchData, 380);
    } catch (e) {
      setDailyFocus(prev => prev.map(t => t.id === id ? { ...t, completed: false } : t));
    }
  };

  const { contexts: focusContexts, projects: focusProjects } = useTaskFilters(dailyFocus);
  const overdueCount = useMemo(
    () => dailyFocus.filter(t => !t.completed && isOverdue(t.due_date)).length,
    [dailyFocus],
  );
  const sortedFocus = useMemo(() => {
    const filtered = applyFilters(dailyFocus, { context: filterContext, project: filterProject });
    const withoutOverdue = hideOverdue ? filtered.filter(t => !isOverdue(t.due_date)) : filtered;
    return sortTasks(withoutOverdue, sortBy);
  }, [dailyFocus, sortBy, filterContext, filterProject, hideOverdue]);

  // When AI suggest is active, float its picks (those still present in the
  // visible list) to the top in the AI's order; everything else keeps its sort.
  const { aiPicks, rest: restFocus } = useMemo(() => partitionByAi(sortedFocus, aiResult), [sortedFocus, aiResult]);
  const hasAiPicks = !!aiPicks && aiPicks.length > 0;

  const filterToggles = [
    {
      key: 'overdue',
      label: 'Hide overdue tasks',
      activeLabel: `Overdue hidden (${overdueCount})`,
      active: hideOverdue,
      onToggle: () => setHideOverdue(v => !v),
      icon: EyeOff,
      show: overdueCount > 0 || hideOverdue,
    },
  ];
  const filterFilters = [
    { key: 'context', label: 'Context', options: focusContexts, value: filterContext, onChange: setFilterContext, renderValue: v => `@${v}` },
    { key: 'project', label: 'Project', options: focusProjects, value: filterProject, onChange: setFilterProject },
  ];

  const focusTotal = dailyFocus.length;
  const focusDone = dailyFocus.filter(t => t.completed).length;
  const remaining = focusTotal - focusDone;

  const shippedToday = stats?.completed_today || 0;
  const dayDenom = focusTotal + shippedToday;
  const dayPct = dayDenom ? Math.round((shippedToday / dayDenom) * 100) : 0;

  const habitsDone = habits.filter(h => h.completed_today).length;
  const habitsPct = habits.length ? Math.round((habitsDone / habits.length) * 100) : 0;

  const statCards = [
    { key: 'inbox',         label: 'Inbox',         value: stats?.inbox || 0,         icon: Inbox,    link: '/inbox' },
    { key: 'next_actions',  label: 'Next Actions',  value: stats?.next_actions || 0,  icon: ListTodo, link: '/lists/next_actions' },
    { key: 'waiting_for',   label: 'Waiting For',   value: stats?.waiting_for || 0,   icon: Clock,    link: '/lists/waiting_for' },
    { key: 'someday_maybe', label: 'Someday/Maybe', value: stats?.someday_maybe || 0, icon: CloudSun, link: '/lists/someday_maybe' },
  ];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1400px]">
      {/* Headline */}
      <div className="mb-10 fresh-stagger">
        <MonoLabel className="mb-3">{formatToday()}</MonoLabel>
        <h1 className="font-display text-[52px] md:text-[64px] leading-[1] tracking-tight">
          {greeting()}{user?.name ? `, ${firstName(user)}.` : '.'}
        </h1>
        <p className="mt-4 text-[15px] max-w-xl text-text-2">
          {focusTotal === 0 ? (
            aiOff ? (
              <>
                Nothing on Today yet — pull from your{' '}
                <Link to="/inbox" className="text-violet-glow underline-offset-4 hover:underline">inbox of {stats?.inbox || 0}</Link>.
              </>
            ) : (
              <>
                Nothing on Today yet —{' '}
                <Link to="/ai" className="text-violet-glow underline-offset-4 hover:underline">let AI suggest a few</Link>{' '}
                or pull from your <Link to="/inbox" className="text-violet-glow underline-offset-4 hover:underline">inbox of {stats?.inbox || 0}</Link>.
              </>
            )
          ) : remaining === 0 ? (
            <>
              <span className="font-display italic text-mint-glow">All clear.</span> Today is done — go close the laptop.
            </>
          ) : (
            <>
              <span className="font-display italic text-mint-glow">{wordifyCount(remaining)}</span>{' '}
              {remaining === 1 ? 'thing left' : 'things left'} on Today.
              {stats?.completed_today > 0 && <> You've already completed <span className="font-mono text-text-1">{stats.completed_today}</span>.</>}
            </>
          )}
        </p>
        {!aiOff && !planResult && (
          <button
            onClick={runPlanDay}
            disabled={planLoading}
            className="gtd-btn gtd-btn-primary mt-5 inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-70"
          >
            {planLoading
              ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              : <CalendarClock className="w-3.5 h-3.5" />}
            {planLoading ? 'Planning…' : 'Plan my day'}
          </button>
        )}
      </div>

      {!aiOff && (
        <DayBrief
          onPlan={runPlanDay}
          planning={planLoading}
          hidden={!!planResult}
          refreshKey={`${stats?.completed_today ?? 0}-${briefBump}`}
        />
      )}

      {planResult && (
        <PlanReviewPanel
          result={planResult}
          onApplied={() => { setPlanResult(null); setBriefBump(b => b + 1); fetchData(); }}
          onCancel={() => setPlanResult(null)}
        />
      )}

      <AutopilotNudge />

      {/* Bento */}
      <div className="grid grid-cols-12 gap-5 fresh-stagger">
        {/* Hero — Today's Focus */}
        <GlassCard className="col-span-12 xl:col-span-8" padded={false}>
          <div className="p-7">
            <div className="mb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <MonoLabel className="mb-1.5">today</MonoLabel>
                  <h2 className="font-display text-[28px] leading-none">What matters now</h2>
                </div>
                {focusTotal > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <FiltersMenu toggles={filterToggles} filters={filterFilters} />
                    <SortDropdown value={sortBy} onChange={setSortBy} compact />
                    {!aiOff && (
                      <button
                        onClick={runAiSuggest}
                        disabled={aiLoading}
                        title="AI — suggest what to focus on"
                        aria-label="AI suggest focus"
                        className="gtd-btn gtd-btn-primary !px-2.5 !py-1.5 grid place-items-center disabled:opacity-70"
                      >
                        {aiLoading
                          ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          : <Sparkles className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {focusTotal > 0 && (
                <ActiveFilters toggles={filterToggles} filters={filterFilters} className="mt-3" />
              )}
            </div>

            {focusTotal === 0 ? (
              <div className="py-12 text-center relative">
                <div className="absolute inset-0 rounded-2xl pointer-events-none"
                     style={{ background: 'radial-gradient(circle at 50% 50%, rgba(167,139,250,0.10), transparent 60%)' }} />
                <div className="relative">
                  <div className="font-mono text-[11px] text-text-3 mb-3">no_focus_tasks</div>
                  <div className="font-display italic text-[22px] mb-2">Pick a few things that matter.</div>
                  <p className="text-[13.5px] text-text-2 max-w-sm mx-auto mb-5">
                    {aiOff
                      ? 'Today keeps your day intentional. Pull from your inbox or your Next Actions.'
                      : 'Today keeps your day intentional. Pull from your inbox, or have AI propose a list.'}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Link to="/inbox" className={`gtd-btn ${aiOff ? 'gtd-btn-primary' : 'gtd-btn-secondary'} inline-flex items-center gap-1.5 text-[12.5px]`}>
                      <Inbox className="w-3.5 h-3.5" /> Open inbox
                    </Link>
                    {!aiOff && (
                      <Link to="/ai" className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px]">
                        <Sparkles className="w-3.5 h-3.5" /> AI suggest
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  {hasAiPicks && (
                    <>
                      <div className="flex items-center justify-between pb-2">
                        <span
                          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider"
                          style={{ color: 'rgb(var(--violet-glow))' }}
                        >
                          <Sparkles className="w-3.5 h-3.5" /> AI focus
                        </span>
                        <button
                          onClick={clearAiSuggest}
                          className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors"
                        >
                          undo
                        </button>
                      </div>
                      {aiPicks.map((t, i) => (
                        <FocusRow
                          key={t.id}
                          task={t}
                          first={i === 0}
                          reason={aiResult.reasonById[t.id]?.reason}
                          confidence={aiResult.reasonById[t.id]?.confidence}
                          onToggle={() => handleComplete(t.id)}
                          onEdit={() => { setEditingTask(t); setShowModal(true); }}
                        />
                      ))}
                      {restFocus.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/[0.06] font-mono text-[10.5px] uppercase tracking-wider text-text-3">
                          everything else
                        </div>
                      )}
                    </>
                  )}
                  {restFocus.map((t, i) => (
                    <FocusRow
                      key={t.id}
                      task={t}
                      first={i === 0}
                      onToggle={() => handleComplete(t.id)}
                      onEdit={() => { setEditingTask(t); setShowModal(true); }}
                    />
                  ))}
                </div>

                <div className="mt-6 pt-5 flex items-center gap-4 border-t border-white/[0.05]">
                  <div className="font-mono text-[11px] text-text-3">{focusTotal} on list</div>
                  <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/[0.05]">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${dayPct}%`,
                        background: 'linear-gradient(90deg, rgb(var(--mint)), rgb(var(--violet)))',
                        boxShadow: '0 0 12px rgba(94,234,212,0.5)',
                      }}
                    />
                  </div>
                  <div className="font-mono text-[11px] text-mint-glow">{shippedToday} done</div>
                </div>
              </>
            )}
          </div>
        </GlassCard>

        {/* Right column */}
        <aside className="col-span-12 xl:col-span-4 flex flex-col gap-5">
          <MomentumCard pct={dayPct} completedToday={shippedToday} />
          <HabitsCard
            habits={habits}
            done={habitsDone}
            pct={habitsPct}
            onToggle={async (id) => { await api.habits.toggle(id); fetchData(); }}
          />
          <SmartActionCard inboxCount={stats?.inbox || 0} aiOff={aiOff} />
          <WorkflowCard />
        </aside>

        {/* Stats row */}
        <section className="col-span-12 mt-2">
          <div className="flex items-end justify-between mb-4">
            <MonoLabel>your lists</MonoLabel>
            <Link to="/inbox" className="font-mono text-[11px] text-text-2 inline-flex items-center gap-1 hover:text-text-1">
              process inbox <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((s) => (
              <StatCard key={s.key} {...s} tone={TONE_BY_LIST[s.key]} />
            ))}
          </div>
        </section>
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

// Autopilot nudges for assisted-mode users, shown at most once each, ever:
//  · streak — after AUTOPILOT_STREAK_TARGET AI suggestions applied in a row
//    without a correction, the AI has earned autonomy; offer it.
//  · reminder — a month in, with some evidence AI has been right, remind the
//    user Autopilot exists (they may never revisit Settings).
// Users in 'off' or 'auto' mode never see either — one chose manual, the
// other is already there.
const AUTOPILOT_STREAK_TARGET = 20;
const REMINDER_MIN_STREAK = 5;
const REMINDER_MIN_DAYS = 30;

function AutopilotNudge() {
  const { user, patchUser } = useAuth();
  const { mode, setMode } = useAiMode();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!user || mode !== 'assisted') return null;
  const streak = user.ai_accept_streak || 0;
  const accountDays = user.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    : 0;
  const showStreak = streak >= AUTOPILOT_STREAK_TARGET && !user.ai_nudge_autopilot_at;
  const showReminder = !showStreak
    && !user.ai_nudge_reminder_at
    && streak >= REMINDER_MIN_STREAK
    && accountDays >= REMINDER_MIN_DAYS;
  if (!showStreak && !showReminder) return null;

  const nudge = showStreak ? 'autopilot' : 'reminder';
  const seenField = showStreak ? 'ai_nudge_autopilot_at' : 'ai_nudge_reminder_at';
  const markSeen = () => {
    patchUser({ [seenField]: new Date().toISOString() });
    api.preferences.aiNudgeSeen(nudge).catch(() => {});
  };
  const turnOn = async () => {
    setBusy(true);
    try {
      await setMode('auto');
      markSeen();
      addToast('Autopilot on — confident tasks now file themselves.', 'success');
    } catch {
      addToast('Could not switch — try again, or use Settings.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="mb-5 relative overflow-hidden" padded={false}>
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(94,234,212,0.14), transparent 70%)' }}
      />
      <div className="p-5 relative">
        <div className="flex items-center justify-between mb-2">
          <MonoLabel tone="violet">{showStreak ? 'earned it' : 'did you know'}</MonoLabel>
          <button
            onClick={markSeen}
            aria-label="Dismiss"
            className="grid place-items-center w-7 h-7 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[13.5px] text-text-1 leading-relaxed max-w-xl">
          {showStreak ? (
            <>
              AI has sorted <span className="font-mono">{streak}</span> tasks in a row and you kept
              every one. Want confident tasks to skip the Inbox and file themselves? Anything
              uncertain still waits for you.
            </>
          ) : (
            <>
              Cleartable has an <span className="font-display italic">Autopilot</span> mode: confident
              tasks file themselves, and only unclear ones wait in your Inbox. You can switch back
              any time in Settings.
            </>
          )}
        </p>
        <div className="mt-3.5 flex items-center gap-2">
          <button
            onClick={turnOn}
            disabled={busy}
            className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" /> {busy ? 'Switching…' : 'Turn on Autopilot'}
          </button>
          <button onClick={markSeen} className="gtd-btn gtd-btn-secondary text-[12.5px]">
            Not now
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

const CONFIDENCE_COLOR = {
  high: 'rgb(var(--mint-glow))',
  medium: 'rgb(var(--violet-glow))',
  low: 'rgb(var(--text-3))',
};

function FocusRow({ task, first, reason, confidence, onToggle, onEdit }) {
  const isDone = !!task.completed;
  return (
    <div
      className={`group flex items-start gap-4 py-4 ${first ? '' : 'border-t border-white/[0.05]'}`}
    >
      <FreshCheck checked={isDone} onChange={onToggle} className="mt-0.5" />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left select-none [touch-action:manipulation]">
        <div className={`text-[14.5px] leading-snug [overflow-wrap:anywhere] ${isDone ? 'line-through opacity-50' : ''}`}>
          {linkify(task.title)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {task.list && (
            <Chip tone={TONE_BY_LIST[task.list] || 'neutral'} dot>
              {listLabel(task.list)}
            </Chip>
          )}
          {task.context && <Chip tone="violet">{contextLabel(task.context)}</Chip>}
          {task.due_date && (
            <Chip tone={isOverdue(task.due_date) ? 'rose' : 'neutral'}>
              <Clock className="w-3 h-3" />
              {isOverdue(task.due_date) && 'overdue · '}
              {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Chip>
          )}
          {task.project_name && <Chip>{task.project_name}</Chip>}
        </div>
        {reason && (
          <div className="mt-2 text-[12.5px] leading-snug text-text-3 [overflow-wrap:anywhere]">
            {confidence && (
              <span
                className="font-mono uppercase text-[9.5px] tracking-wider mr-1.5"
                style={{ color: CONFIDENCE_COLOR[confidence] || 'rgb(var(--text-3))' }}
              >
                {confidence}
              </span>
            )}
            <span className="italic">{reason}</span>
          </div>
        )}
      </button>
      <ArrowUpRight className="w-4 h-4 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-3" />
    </div>
  );
}

function MomentumCard({ pct, completedToday }) {
  return (
    <GlassCard>
      <MonoLabel className="mb-4">momentum</MonoLabel>
      <div className="flex items-center gap-5">
        <div
          className="w-[88px] h-[88px] grid place-items-center shrink-0 rounded-full"
          style={{
            background: `conic-gradient(from -90deg, rgb(var(--mint)) 0% ${pct}%, rgba(255,255,255,0.06) ${pct}% 100%)`,
            boxShadow: '0 0 30px -8px rgba(94,234,212,0.4)',
          }}
        >
          <div className="w-[72px] h-[72px] rounded-full grid place-items-center bg-bg">
            <span className="font-mono text-[18px]">
              {pct}<span className="text-text-3 text-[11px]">%</span>
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[34px] leading-none">{completedToday}</span>
            <Flame className="w-4 h-4 text-amber" />
          </div>
          <MonoLabel className="mt-1.5">done today</MonoLabel>
          <div className="font-mono text-[11px] mt-3 text-text-3">
            focus complete <span className="text-text-2">{pct}%</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function HabitsCard({ habits, done, pct, onToggle }) {
  if (!habits.length) {
    return (
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <MonoLabel>habits</MonoLabel>
          <Link to="/habits" className="font-mono text-[10.5px] text-text-3 hover:text-text-1">setup</Link>
        </div>
        <div className="font-display italic text-[16px] text-text-2">
          No habits yet — <Link to="/habits" className="text-mint-glow underline-offset-4 hover:underline">add a routine</Link>.
        </div>
      </GlassCard>
    );
  }
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <MonoLabel>today's habits</MonoLabel>
        <Link to="/habits" className="font-mono text-[10.5px] text-text-3 inline-flex items-center gap-1 hover:text-text-1">
          all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/[0.05]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'rgb(var(--mint))', boxShadow: '0 0 10px rgba(94,234,212,0.6)' }}
          />
        </div>
        <span className="font-mono text-[11px] text-mint-glow">{done}/{habits.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {habits.map(h => (
          <button
            key={h.id}
            onClick={() => onToggle(h.id)}
            className="flex items-center gap-2.5 w-full text-left py-1 rounded -mx-1 px-1 hover:bg-white/[0.03] transition-colors"
          >
            <FreshCheck checked={!!h.completed_today} onChange={() => onToggle(h.id)} size={18} />
            <span className={`text-[13px] ${h.completed_today ? 'line-through text-text-3' : 'text-text-1'}`}>
              {h.name}
            </span>
            {h.streak > 0 && (
              <span className="ml-auto font-mono text-[10.5px] text-amber-glow inline-flex items-center gap-1">
                <Flame className="w-3 h-3" />{h.streak}
              </span>
            )}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

function SmartActionCard({ inboxCount, aiOff }) {
  return (
    <GlassCard className="relative overflow-hidden" padded={false}>
      <div
        className="absolute -right-8 -top-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.18), transparent 70%)' }}
      />
      <div className="p-5 relative">
        <div className="flex items-center gap-2 mb-2.5">
          {!aiOff && <Sparkles className="w-3.5 h-3.5 text-violet" />}
          <MonoLabel tone="violet">{aiOff ? 'suggestion' : 'smart suggestion'}</MonoLabel>
        </div>
        {inboxCount > 0 ? (
          <>
            <div className="text-[13.5px] leading-snug">
              You have <span className="font-mono text-text-1">{inboxCount}</span> {inboxCount === 1 ? 'item' : 'items'} in your inbox —{' '}
              <span className="font-display italic">process them now</span> while you're warmed up.
            </div>
            <div className="mt-3.5 flex gap-2">
              {aiOff ? (
                <Link
                  to="/inbox"
                  className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                  style={{ background: 'rgba(167,139,250,0.14)', color: '#ede9fe', border: '1px solid rgba(167,139,250,0.25)' }}
                >
                  open inbox <ChevronRight className="w-3 h-3" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/ai"
                    className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                    style={{ background: 'rgba(167,139,250,0.14)', color: '#ede9fe', border: '1px solid rgba(167,139,250,0.25)' }}
                  >
                    <Sparkles className="w-3 h-3" /> AI process
                  </Link>
                  <Link to="/inbox" className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg text-text-3 hover:text-text-1">
                    manual
                  </Link>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-[13.5px] leading-snug">
              <span className="font-display italic text-mint-glow">Inbox zero.</span> Nice. Take a minute to glance at your projects.
            </div>
            <div className="mt-3.5">
              <Link
                to="/projects"
                className="text-[11.5px] font-mono px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-text-2 hover:text-text-1"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                review projects <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}

function WorkflowCard() {
  const steps = [
    { num: '01', text: 'Capture everything into Inbox.' },
    { num: '02', text: 'Clarify — is it actionable?' },
    { num: '03', text: 'Organize into Next Actions, Waiting For, or Someday.' },
    { num: '04', text: 'Reflect — weekly review to stay current.' },
    { num: '05', text: 'Engage — work from your Next Actions.' },
  ];
  return (
    <GlassCard>
      <MonoLabel className="mb-3">the workflow</MonoLabel>
      <ul className="space-y-1.5">
        {steps.map(s => (
          <li key={s.num} className="flex gap-2 text-[12px] leading-relaxed">
            <span className="font-mono text-text-3 shrink-0">{s.num}</span>
            <span className="text-text-2">{s.text}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function StatCard({ label, value, icon: Icon, link, tone }) {
  const tint = (a) => `rgb(var(--${tone}) / ${a})`;
  return (
    <Link to={link}>
      <GlassCard padded={false} className="block p-5 transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-start justify-between mb-5">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ background: tint(0.1), border: `1px solid ${tint(0.22)}` }}
          >
            <Icon className="w-4 h-4" style={{ color: `rgb(var(--${tone}))` }} />
          </div>
          <ArrowUpRight className="w-3.5 h-3.5 text-text-3" />
        </div>
        <div className="font-display text-[34px] leading-none tabular-nums">{value}</div>
        <MonoLabel className="mt-2">{label}</MonoLabel>
      </GlassCard>
    </Link>
  );
}
