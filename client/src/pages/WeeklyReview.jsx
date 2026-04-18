import { useState, useEffect } from 'react';
import { RotateCcw, Inbox, ListTodo, Clock, CloudSun, FolderKanban, ChevronDown, ChevronRight, CheckCircle2, ArrowRight, Flame, AlertTriangle, Sparkles, TrendingUp, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import MonoLabel from '../components/ui/MonoLabel';

const STEPS = [
  { num: 1, label: 'Get Clear',   tone: 'amber' },
  { num: 2, label: 'Get Current', tone: 'mint'  },
  { num: 3, label: 'Get Creative', tone: 'violet' },
  { num: 4, label: 'Complete',    tone: 'mint'  },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-10 flex-wrap">
      {STEPS.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        const tone = s.tone;
        return (
          <div key={s.num} className="flex items-center">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider transition-all"
              style={
                isActive
                  ? {
                      background: `rgb(var(--${tone}) / 0.16)`,
                      color: `rgb(var(--${tone}-glow))`,
                      boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.35), 0 0 16px rgb(var(--${tone}) / 0.18)`,
                    }
                  : isDone
                  ? {
                      background: 'rgb(var(--mint) / 0.10)',
                      color: 'rgb(var(--mint-glow))',
                      boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)',
                    }
                  : {
                      color: 'rgb(var(--text-3))',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    }
              }
            >
              {isDone ? <CheckCircle2 className="w-3 h-3" /> : <span>{s.num.toString().padStart(2, '0')}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="w-6 h-px mx-1"
                style={{ background: isDone ? 'rgb(var(--mint) / 0.4)' : 'rgba(255,255,255,0.08)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CollapsibleSection({ title, eyebrow, icon: Icon, tone = 'violet', count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl glass overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 glass-hover">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-text-3" /> : <ChevronRight className="w-3.5 h-3.5 text-text-3" />}
          <div
            className="grid place-items-center w-7 h-7 rounded-lg"
            style={{ background: `rgb(var(--${tone}) / 0.12)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.22)` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: `rgb(var(--${tone}-glow))` }} />
          </div>
          <div className="text-left">
            <div className="mono-label" style={{ color: `rgb(var(--${tone}-glow))` }}>{eyebrow}</div>
            <div className="text-[14px] font-medium text-text-1 mt-0.5">{title}</div>
          </div>
        </div>
        <span className="font-mono text-[11px] text-text-3">{count.toString().padStart(2, '0')}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-white/[0.05]">
          <div className="pt-3 space-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function WeeklyReview() {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviewData, setReviewData] = useState(null);
  const [markedComplete, setMarkedComplete] = useState(new Set());
  const [markedDelete, setMarkedDelete] = useState(new Set());
  const [markedMove, setMarkedMove] = useState(new Map());
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const [resultStreak, setResultStreak] = useState(0);

  useEffect(() => {
    const fetchReview = async () => {
      try {
        const data = await api.ai.weeklyReview();
        setReviewData(data);
      } catch (err) {
        addToast('Failed to load review data: ' + err.message, 'error');
      } finally { setLoading(false); }
    };
    fetchReview();
  }, []);

  const toggleComplete = (id) => {
    setMarkedComplete(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleDelete = (id) => {
    setMarkedDelete(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const moveTask = (id, toList) => {
    setMarkedMove(prev => {
      const next = new Map(prev);
      if (next.get(id) === toList) next.delete(id);
      else next.set(id, toList);
      return next;
    });
  };

  const handleCompleteReview = async () => {
    setCompleting(true);
    try {
      const result = await api.ai.completeReview({
        tasksCompleted: [...markedComplete],
        tasksDeleted: [...markedDelete],
        tasksMoved: [...markedMove.entries()].map(([id, toList]) => ({ id, toList })),
        inboxCountAtStart: reviewData?.stats?.inbox || 0,
        aiSummary: reviewData?.aiAnalysis,
      });
      setResultStreak(result.streak);
      setDone(true);
      addToast('Weekly review complete!', 'success');
    } catch (err) { addToast(err.message, 'error'); }
    finally { setCompleting(false); }
  };

  const isTaskActioned = (id) => markedComplete.has(id) || markedDelete.has(id) || markedMove.has(id);

  const renderTaskActions = (task, listOptions) => {
    const actioned = isTaskActioned(task.id);
    return (
      <div className={`relative ${actioned ? 'opacity-70' : ''}`}>
        <TaskCard task={task} showList />
        <div className="flex flex-wrap gap-1 mt-1.5 ml-9">
          <ActionPill
            active={markedComplete.has(task.id)}
            tone="mint"
            onClick={() => toggleComplete(task.id)}
          >
            done
          </ActionPill>
          {listOptions.map(opt => (
            <ActionPill
              key={opt.list}
              active={markedMove.get(task.id) === opt.list}
              tone="violet"
              onClick={() => moveTask(task.id, opt.list)}
            >
              {opt.label.toLowerCase()}
            </ActionPill>
          ))}
          <ActionPill
            active={markedDelete.has(task.id)}
            tone="rose"
            onClick={() => toggleDelete(task.id)}
          >
            delete
          </ActionPill>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="px-6 lg:px-12 pt-10 pb-20">
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
          <p className="font-mono text-[11px] text-text-3 uppercase tracking-wider">analyzing_your_system</p>
        </div>
      </div>
    );
  }

  if (!reviewData) {
    return (
      <div className="px-6 lg:px-12 pt-10 pb-20">
        <div className="rounded-2xl glass p-8 text-center text-text-2">Failed to load review data. Please try again.</div>
      </div>
    );
  }

  const ai = reviewData.aiAnalysis || {};

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <MonoLabel tone="violet" className="mb-3">ritual</MonoLabel>
        <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight flex items-baseline gap-3 flex-wrap">
          Weekly Review
          {reviewData.streak > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] align-middle"
              style={{ background: 'rgb(var(--amber) / 0.14)', color: 'rgb(var(--amber-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)' }}
            >
              <Flame className="w-3 h-3" /> {reviewData.streak}w
            </span>
          )}
        </h1>
        <p className="font-display italic text-[18px] text-text-2 mt-2">
          {reviewData.lastReview
            ? `Last review · ${new Date(reviewData.lastReview.completed_at).toLocaleDateString()}`
            : 'Your first weekly review.'}
        </p>
      </div>

      <StepIndicator current={step} />

      {/* Step 1: Get Clear */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-2xl glass p-6">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="grid place-items-center w-9 h-9 rounded-xl"
                style={{ background: 'rgb(var(--amber) / 0.12)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.22)' }}
              >
                <Inbox className="w-4 h-4" style={{ color: 'rgb(var(--amber-glow))' }} />
              </div>
              <div>
                <div className="mono-label" style={{ color: 'rgb(var(--amber-glow))' }}>step_01</div>
                <h2 className="font-display text-[26px] leading-none mt-1">Get Clear</h2>
              </div>
            </div>

            {reviewData.stats.inbox > 0 ? (
              <div
                className="rounded-2xl p-5 mb-5 relative overflow-hidden"
                style={{ background: 'rgb(var(--amber) / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.22)' }}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgb(var(--amber-glow))' }} />
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-text-1">
                      {reviewData.stats.inbox} {reviewData.stats.inbox === 1 ? 'item' : 'items'} in your inbox
                    </p>
                    <p className="text-[12.5px] text-text-2 mt-1">
                      Process them before continuing — or come back after the review.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Link to="/inbox" className="gtd-btn gtd-btn-secondary text-[12px]">Go to Inbox</Link>
                      <Link to="/ai" className="gtd-btn gtd-btn-secondary text-[12px] inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI Process
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="rounded-2xl p-5 mb-5"
                style={{ background: 'rgb(var(--mint) / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.22)' }}
              >
                <p className="flex items-center gap-2 text-[14px] text-text-1">
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'rgb(var(--mint-glow))' }} />
                  Inbox is empty — beautiful.
                </p>
              </div>
            )}

            <div className="mt-6">
              <div className="mono-label mb-2">mind_sweep</div>
              <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
                Empty your head. Capture anything still lingering — commitments, follow-ups, ideas, vague worries. Get them down.
              </p>
              <QuickCapture onCapture={() => {
                setReviewData(prev => ({
                  ...prev,
                  stats: { ...prev.stats, inbox: prev.stats.inbox + 1 },
                }));
              }} />
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 text-[12.5px]">
              Next: Get Current <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Get Current */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="mb-3">
            <div className="mono-label mb-2" style={{ color: 'rgb(var(--mint-glow))' }}>step_02</div>
            <h2 className="font-display text-[28px] leading-none">Get Current</h2>
            <p className="text-[13px] text-text-2 mt-2 leading-relaxed">
              Review each list. Is everything still relevant? Mark items done, move them, or delete the stale.
            </p>
          </div>

          <CollapsibleSection title="Next Actions" eyebrow="do" icon={ListTodo} tone="mint" count={reviewData.nextActions.length} defaultOpen>
            {reviewData.nextActions.length === 0
              ? <p className="font-mono text-[11px] text-text-3 py-2">no_next_actions</p>
              : reviewData.nextActions.map(task => (
                  <div key={task.id}>{renderTaskActions(task, [{ list: 'someday_maybe', label: 'Someday' }])}</div>
                ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Waiting For" eyebrow="delegated" icon={Clock} tone="rose" count={reviewData.waitingFor.length}>
            {reviewData.waitingFor.length === 0
              ? <p className="font-mono text-[11px] text-text-3 py-2">nothing_pending</p>
              : reviewData.waitingFor.map(task => (
                  <div key={task.id}>{renderTaskActions(task, [{ list: 'next_actions', label: 'Take back' }])}</div>
                ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Someday / Maybe" eyebrow="incubate" icon={CloudSun} tone="violet" count={reviewData.somedayMaybe.length}>
            {reviewData.somedayMaybe.length === 0
              ? <p className="font-mono text-[11px] text-text-3 py-2">no_someday_items</p>
              : reviewData.somedayMaybe.map(task => (
                  <div key={task.id}>{renderTaskActions(task, [{ list: 'next_actions', label: 'Activate' }])}</div>
                ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Projects" eyebrow="scope" icon={FolderKanban} tone="violet" count={reviewData.projects.length}>
            {reviewData.projects.length === 0
              ? <p className="font-mono text-[11px] text-text-3 py-2">no_projects</p>
              : reviewData.projects.map(p => (
                  <div
                    key={p.id}
                    className="rounded-xl p-3"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      boxShadow: !p.next_action
                        ? 'inset 0 0 0 1px rgb(var(--rose) / 0.30), inset 3px 0 0 rgb(var(--rose-glow))'
                        : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-text-1 truncate">{p.name}</p>
                        <p className="font-mono text-[10.5px] text-text-3 mt-0.5">
                          {p.task_count} tasks{p.execution_mode === 'sequential' && ' · sequential'}
                        </p>
                      </div>
                      {!p.next_action && (
                        <span
                          className="font-mono text-[10.5px] px-2 py-1 rounded-md flex-shrink-0 inline-flex items-center gap-1"
                          style={{ background: 'rgb(var(--rose) / 0.12)', color: 'rgb(var(--rose-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--rose) / 0.28)' }}
                        >
                          <AlertTriangle className="w-3 h-3" /> no_next_action
                        </span>
                      )}
                    </div>
                  </div>
                ))
            }
          </CollapsibleSection>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="gtd-btn gtd-btn-secondary text-[12.5px]">Back</button>
            <button onClick={() => setStep(3)} className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 text-[12.5px]">
              Next: AI Insights <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Get Creative */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="mb-3">
            <div className="mono-label mb-2" style={{ color: 'rgb(var(--violet-glow))' }}>step_03</div>
            <h2 className="font-display text-[28px] leading-none flex items-center gap-2">
              AI Insights
              <Sparkles className="w-5 h-5" style={{ color: 'rgb(var(--violet-glow))' }} />
            </h2>
          </div>

          {ai.error ? (
            <div className="rounded-2xl glass p-8 text-center text-text-2 text-[13px]">
              AI analysis unavailable. You can still complete your review.
            </div>
          ) : (
            <>
              {/* Health Score + Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl glass p-5 text-center relative overflow-hidden">
                  <div className="mono-label mb-3">system_health</div>
                  <p
                    className="font-display text-[64px] leading-none"
                    style={{
                      color: (ai.system_health_score || 0) >= 7
                        ? 'rgb(var(--mint-glow))'
                        : (ai.system_health_score || 0) >= 4
                          ? 'rgb(var(--amber-glow))'
                          : 'rgb(var(--rose-glow))',
                    }}
                  >
                    {ai.system_health_score || '?'}
                    <span className="text-[18px] text-text-3 ml-1">/10</span>
                  </p>
                </div>
                <div className="rounded-2xl glass p-5 md:col-span-2">
                  <div className="mono-label mb-3">weekly_summary</div>
                  <p className="text-[13.5px] text-text-1 leading-relaxed">{ai.weekly_summary}</p>
                  {ai.tasks_completed_insight && (
                    <p className="text-[12.5px] text-text-2 mt-3 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-mint-glow" /> {ai.tasks_completed_insight}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="rounded-2xl glass p-5 relative overflow-hidden"
                style={{ boxShadow: '0 8px 32px -12px rgba(0,0,0,0.45), inset 0 1px 0 rgb(255 255 255 / 0.04), inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}
              >
                <div
                  className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgb(var(--violet) / 0.18), transparent 70%)' }}
                />
                <div className="relative">
                  <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>this_week</div>
                  <p className="font-display text-[40px] leading-none mt-2">
                    {reviewData.completedThisWeek}
                    <span className="text-[16px] text-text-3 ml-2 align-baseline">tasks shipped</span>
                  </p>
                </div>
              </div>

              {ai.stale_items?.length > 0 && (
                <div className="rounded-2xl glass p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'rgb(var(--amber-glow))' }} />
                    <div className="mono-label" style={{ color: 'rgb(var(--amber-glow))' }}>stale_items</div>
                    <span className="font-mono text-[10.5px] text-text-3">{ai.stale_items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {ai.stale_items.map((item, i) => {
                      const tone = item.suggestion === 'delete' ? 'rose'
                        : item.suggestion === 'follow_up' ? 'violet'
                        : 'amber';
                      return (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-3 p-3 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-1 truncate">{item.title}</p>
                            <p className="font-mono text-[10.5px] text-text-3 mt-0.5">{item.days_stale}d · {item.reason}</p>
                          </div>
                          <span
                            className="font-mono text-[10.5px] uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
                            style={{ background: `rgb(var(--${tone}) / 0.12)`, color: `rgb(var(--${tone}-glow))`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.25)` }}
                          >
                            {item.suggestion?.replace('_', ' ')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ai.projects_needing_attention?.length > 0 && (
                <div className="rounded-2xl glass p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FolderKanban className="w-3.5 h-3.5" style={{ color: 'rgb(var(--violet-glow))' }} />
                    <div className="mono-label" style={{ color: 'rgb(var(--violet-glow))' }}>projects_attention</div>
                  </div>
                  <div className="space-y-2">
                    {ai.projects_needing_attention.map((p, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                      >
                        <p className="text-[13px] font-medium text-text-1">{p.name}</p>
                        <p className="text-[12px] text-text-2 mt-0.5">{p.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ai.waiting_for_followups?.length > 0 && (
                <div className="rounded-2xl glass p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-3.5 h-3.5" style={{ color: 'rgb(var(--rose-glow))' }} />
                    <div className="mono-label" style={{ color: 'rgb(var(--rose-glow))' }}>follow_ups</div>
                  </div>
                  <div className="space-y-2">
                    {ai.waiting_for_followups.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                      >
                        <p className="text-[13px] font-medium text-text-1">{item.title}</p>
                        <p className="text-[12px] text-text-2 mt-0.5">
                          {item.waiting_for_person && <span className="font-mono text-[11px] text-rose-glow">{item.waiting_for_person}</span>}
                          {item.waiting_for_person && ' · '}
                          {item.suggestion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ai.recommendations?.length > 0 && (
                <div className="rounded-2xl glass p-5">
                  <div className="mono-label mb-3">next_week</div>
                  <ul className="space-y-2.5">
                    {ai.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-3 text-[13px] text-text-1">
                        <span className="font-mono text-[11px] text-violet-glow mt-0.5 flex-shrink-0">
                          {(i + 1).toString().padStart(2, '0')}
                        </span>
                        <span className="leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ai.motivational_insight && (
                <div
                  className="rounded-2xl glass p-5 relative overflow-hidden"
                  style={{ boxShadow: '0 8px 32px -12px rgba(0,0,0,0.45), inset 0 1px 0 rgb(255 255 255 / 0.04), inset 0 0 0 1px rgb(var(--mint) / 0.20)' }}
                >
                  <div
                    className="absolute -bottom-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgb(var(--mint) / 0.18), transparent 70%)' }}
                  />
                  <div className="flex items-start gap-3 relative">
                    <Heart className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgb(var(--mint-glow))' }} />
                    <p className="font-display italic text-[18px] text-text-1 leading-snug">{ai.motivational_insight}</p>
                  </div>
                </div>
              )}

              {reviewData.habitStats?.habits?.length > 0 && (
                <div className="rounded-2xl glass p-5">
                  <div className="mono-label mb-3">habits</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {reviewData.habitStats.habits.map(h => (
                      <div
                        key={h.id}
                        className="text-center p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.02)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
                      >
                        <p className="text-[11.5px] font-medium text-text-1 truncate">{h.name}</p>
                        <p className="font-display text-[24px] leading-tight mt-1" style={{ color: h.color }}>
                          {h.completionRate}<span className="text-[12px] text-text-3">%</span>
                        </p>
                        {h.streak > 0 && (
                          <p className="font-mono text-[10px] mt-0.5 inline-flex items-center justify-center gap-1" style={{ color: 'rgb(var(--amber-glow))' }}>
                            <Flame className="w-3 h-3" /> {h.streak}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="gtd-btn gtd-btn-secondary text-[12.5px]">Back</button>
            <button onClick={() => setStep(4)} className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 text-[12.5px]">
              Next: Complete <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && (
        <div className="space-y-5">
          {done ? (
            <div className="rounded-2xl glass p-12 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 30%, rgb(var(--mint) / 0.18), transparent 60%)' }}
              />
              <div className="relative">
                <div
                  className="inline-grid place-items-center w-16 h-16 rounded-2xl mb-5"
                  style={{
                    background: 'rgb(var(--mint) / 0.14)',
                    boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.30), 0 0 30px rgb(var(--mint) / 0.25)',
                  }}
                >
                  <CheckCircle2 className="w-7 h-7" style={{ color: 'rgb(var(--mint-glow))' }} />
                </div>
                <div className="mono-label mb-2" style={{ color: 'rgb(var(--mint-glow))' }}>review_complete</div>
                <h2 className="font-display text-[36px] leading-none mb-2">A clean slate.</h2>
                {resultStreak > 0 && (
                  <p
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] mb-5"
                    style={{ background: 'rgb(var(--amber) / 0.14)', color: 'rgb(var(--amber-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)' }}
                  >
                    <Flame className="w-3.5 h-3.5" /> {resultStreak} week streak
                  </p>
                )}
                <p className="text-[13.5px] text-text-2 mt-2">
                  Your system is up to date. See you next week.
                </p>
                <Link
                  to="/"
                  className="gtd-btn gtd-btn-primary mt-6 inline-flex items-center gap-2 text-[12.5px]"
                >
                  Back to Today
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl glass p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="grid place-items-center w-9 h-9 rounded-xl"
                    style={{ background: 'rgb(var(--mint) / 0.12)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.22)' }}
                  >
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'rgb(var(--mint-glow))' }} />
                  </div>
                  <div>
                    <div className="mono-label" style={{ color: 'rgb(var(--mint-glow))' }}>step_04</div>
                    <h2 className="font-display text-[26px] leading-none mt-1">Review Summary</h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryStat tone="mint"   value={markedComplete.size}      label="completed" />
                  <SummaryStat tone="violet" value={markedMove.size}          label="moved" />
                  <SummaryStat tone="rose"   value={markedDelete.size}        label="deleted" />
                  <SummaryStat tone="amber"  value={reviewData.completedThisWeek} label="this_week" />
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="gtd-btn gtd-btn-secondary text-[12.5px]">Back</button>
                <button
                  onClick={handleCompleteReview}
                  disabled={completing}
                  className="gtd-btn gtd-btn-primary inline-flex items-center gap-2 text-[12.5px] disabled:opacity-60"
                >
                  {completing ? 'Saving…' : 'Complete Review'}
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionPill({ active, tone, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[10.5px] uppercase tracking-wider px-2 py-1 rounded-md transition-all"
      style={
        active
          ? {
              background: `rgb(var(--${tone}) / 0.16)`,
              color: `rgb(var(--${tone}-glow))`,
              boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.32)`,
            }
          : {
              color: 'rgb(var(--text-3))',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            }
      }
    >
      {children}
    </button>
  );
}

function SummaryStat({ tone, value, label }) {
  return (
    <div
      className="text-center p-4 rounded-xl"
      style={{ background: `rgb(var(--${tone}) / 0.06)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.20)` }}
    >
      <div className="font-display text-[32px] leading-none" style={{ color: `rgb(var(--${tone}-glow))` }}>
        {value}
      </div>
      <div className="mono-label mt-1.5">{label}</div>
    </div>
  );
}
