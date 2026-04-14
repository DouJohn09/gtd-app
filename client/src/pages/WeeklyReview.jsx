import { useState, useEffect } from 'react';
import { RotateCcw, Inbox, ListTodo, Clock, CloudSun, FolderKanban, ChevronDown, ChevronRight, CheckCircle2, Trash2, ArrowRight, Flame, AlertTriangle, Sparkles, TrendingUp, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';

const STEPS = [
  { num: 1, label: 'Get Clear' },
  { num: 2, label: 'Get Current' },
  { num: 3, label: 'Get Creative' },
  { num: 4, label: 'Complete' },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            s.num === current ? 'bg-blue-600 text-white' :
            s.num < current ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
            'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
          }`}>
            {s.num < current ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.num}</span>}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-8 h-0.5 mx-1 ${s.num < current ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
        </div>
      ))}
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, color, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="gtd-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <Icon className={`w-5 h-5 ${color}`} />
          <span className="font-medium">{title}</span>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{count} items</span>
      </button>
      {open && <div className="mt-4 pt-4 border-t dark:border-gray-700 space-y-2">{children}</div>}
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
      } finally {
        setLoading(false);
      }
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
      if (next.get(id) === toList) { next.delete(id); } else { next.set(id, toList); }
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
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCompleting(false);
    }
  };

  const isTaskActioned = (id) => markedComplete.has(id) || markedDelete.has(id) || markedMove.has(id);

  const renderTaskActions = (task, listOptions) => {
    const actioned = isTaskActioned(task.id);
    return (
      <div className={`relative ${actioned ? 'opacity-60' : ''}`}>
        {markedComplete.has(task.id) && (
          <div className="absolute inset-0 bg-green-50 dark:bg-green-900/20 rounded-lg z-0" />
        )}
        {markedDelete.has(task.id) && (
          <div className="absolute inset-0 bg-red-50 dark:bg-red-900/20 rounded-lg z-0" />
        )}
        <div className="relative z-10">
          <TaskCard task={task} showList />
          <div className="flex gap-1 mt-1 ml-8">
            <button
              onClick={() => toggleComplete(task.id)}
              className={`text-xs px-2 py-1 rounded transition-colors ${markedComplete.has(task.id) ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
            >
              Done
            </button>
            {listOptions.map(opt => (
              <button
                key={opt.list}
                onClick={() => moveTask(task.id, opt.list)}
                className={`text-xs px-2 py-1 rounded transition-colors ${markedMove.get(task.id) === opt.list ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-blue-100 dark:hover:bg-blue-900/30'}`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => toggleDelete(task.id)}
              className={`text-xs px-2 py-1 rounded transition-colors ${markedDelete.has(task.id) ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 dark:text-gray-400">AI is analyzing your system...</p>
      </div>
    );
  }

  if (!reviewData) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Failed to load review data. Please try again.</p>
      </div>
    );
  }

  const ai = reviewData.aiAnalysis || {};

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <RotateCcw className="w-8 h-8 text-blue-600" />
          Weekly Review
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {reviewData.lastReview
            ? `Last review: ${new Date(reviewData.lastReview.completed_at).toLocaleDateString()}`
            : 'Your first weekly review!'
          }
          {reviewData.streak > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-orange-500">
              <Flame className="w-4 h-4" /> {reviewData.streak} week streak
            </span>
          )}
        </p>
      </div>

      <StepIndicator current={step} />

      {/* Step 1: Get Clear */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="gtd-card">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Inbox className="w-5 h-5 text-yellow-500" />
              Step 1: Get Clear
            </h2>

            {reviewData.stats.inbox > 0 ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900 dark:text-yellow-300">
                      You have {reviewData.stats.inbox} items in your inbox
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                      Process them before continuing, or come back to them after the review.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Link to="/inbox" className="gtd-btn gtd-btn-secondary text-sm">Go to Inbox</Link>
                      <Link to="/ai" className="gtd-btn gtd-btn-secondary text-sm flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI Process
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <p className="text-green-800 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Inbox is empty — great job!
                </p>
              </div>
            )}

            <div className="mt-6">
              <h3 className="font-medium mb-2">Mind Sweep</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Empty your head. Capture anything that's on your mind — commitments, emails to respond to, calls to make, ideas brewing, things you're waiting for.
              </p>
              <QuickCapture onCapture={() => {
                setReviewData(prev => ({
                  ...prev,
                  stats: { ...prev.stats, inbox: prev.stats.inbox + 1 }
                }));
              }} />
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="gtd-btn gtd-btn-primary flex items-center gap-2">
              Next: Get Current <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Get Current */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <ListTodo className="w-5 h-5 text-green-500" />
            Step 2: Get Current
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Review each list. Is everything still relevant? Mark items done, move them, or delete stale ones.
          </p>

          <CollapsibleSection title="Next Actions" icon={ListTodo} color="text-green-500" count={reviewData.nextActions.length} defaultOpen>
            {reviewData.nextActions.length === 0
              ? <p className="text-sm text-gray-400">No next actions</p>
              : reviewData.nextActions.map(task => (
                <div key={task.id}>{renderTaskActions(task, [{ list: 'someday_maybe', label: 'Someday' }])}</div>
              ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Waiting For" icon={Clock} color="text-orange-500" count={reviewData.waitingFor.length}>
            {reviewData.waitingFor.length === 0
              ? <p className="text-sm text-gray-400">Nothing pending</p>
              : reviewData.waitingFor.map(task => (
                <div key={task.id}>{renderTaskActions(task, [{ list: 'next_actions', label: 'Do it myself' }])}</div>
              ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Someday/Maybe" icon={CloudSun} color="text-blue-500" count={reviewData.somedayMaybe.length}>
            {reviewData.somedayMaybe.length === 0
              ? <p className="text-sm text-gray-400">No someday items</p>
              : reviewData.somedayMaybe.map(task => (
                <div key={task.id}>{renderTaskActions(task, [{ list: 'next_actions', label: 'Activate' }])}</div>
              ))
            }
          </CollapsibleSection>

          <CollapsibleSection title="Projects" icon={FolderKanban} color="text-indigo-500" count={reviewData.projects.length}>
            {reviewData.projects.length === 0
              ? <p className="text-sm text-gray-400">No projects</p>
              : reviewData.projects.map(p => (
                <div key={p.id} className={`gtd-card ${!p.next_action ? 'border-l-4 border-l-red-400' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {p.task_count} tasks
                        {p.execution_mode === 'sequential' && ' | Sequential'}
                      </p>
                    </div>
                    {!p.next_action && (
                      <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No next action
                      </span>
                    )}
                  </div>
                </div>
              ))
            }
          </CollapsibleSection>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="gtd-btn gtd-btn-secondary">Back</button>
            <button onClick={() => setStep(3)} className="gtd-btn gtd-btn-primary flex items-center gap-2">
              Next: AI Insights <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Get Creative */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Step 3: AI Insights
          </h2>

          {ai.error ? (
            <div className="gtd-card text-center py-8 text-gray-500">
              <p>AI analysis unavailable. You can still complete your review.</p>
            </div>
          ) : (
            <>
              {/* Health Score + Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="gtd-card text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">System Health</p>
                  <p className={`text-4xl font-bold ${
                    (ai.system_health_score || 0) >= 7 ? 'text-green-500' :
                    (ai.system_health_score || 0) >= 4 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {ai.system_health_score || '?'}/10
                  </p>
                </div>
                <div className="gtd-card md:col-span-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Weekly Summary</p>
                  <p className="text-sm">{ai.weekly_summary}</p>
                  {ai.tasks_completed_insight && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> {ai.tasks_completed_insight}
                    </p>
                  )}
                </div>
              </div>

              <div className="gtd-card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">This Week</p>
                <p className="text-2xl font-bold text-blue-600">{reviewData.completedThisWeek} tasks completed</p>
              </div>

              {/* Stale Items */}
              {ai.stale_items?.length > 0 && (
                <div className="gtd-card">
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    Stale Items ({ai.stale_items.length})
                  </h3>
                  <div className="space-y-2">
                    {ai.stale_items.map((item, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-2 rounded bg-gray-50 dark:bg-gray-800">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-gray-500">{item.days_stale} days stale | {item.reason}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                          item.suggestion === 'delete' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          item.suggestion === 'follow_up' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {item.suggestion?.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects Needing Attention */}
              {ai.projects_needing_attention?.length > 0 && (
                <div className="gtd-card">
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <FolderKanban className="w-4 h-4 text-indigo-500" />
                    Projects Needing Attention
                  </h3>
                  <div className="space-y-2">
                    {ai.projects_needing_attention.map((p, i) => (
                      <div key={i} className="p-2 rounded bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waiting For Follow-ups */}
              {ai.waiting_for_followups?.length > 0 && (
                <div className="gtd-card">
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-orange-500" />
                    Follow-ups Needed
                  </h3>
                  <div className="space-y-2">
                    {ai.waiting_for_followups.map((item, i) => (
                      <div key={i} className="p-2 rounded bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-gray-500">
                          {item.waiting_for_person && `Waiting on: ${item.waiting_for_person} | `}
                          {item.suggestion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {ai.recommendations?.length > 0 && (
                <div className="gtd-card">
                  <h3 className="font-medium mb-3">Recommendations for Next Week</h3>
                  <ul className="space-y-2">
                    {ai.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Motivational Insight */}
              {ai.motivational_insight && (
                <div className="gtd-card bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-3">
                    <Heart className="w-5 h-5 text-green-600 mt-0.5" />
                    <p className="text-sm text-green-800 dark:text-green-300">{ai.motivational_insight}</p>
                  </div>
                </div>
              )}

              {/* Habit Summary */}
              {reviewData.habitStats?.habits?.length > 0 && (
                <div className="gtd-card">
                  <h3 className="font-medium mb-3">Habit Progress</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {reviewData.habitStats.habits.map(h => (
                      <div key={h.id} className="text-center p-2 rounded bg-gray-50 dark:bg-gray-800">
                        <p className="text-xs font-medium truncate">{h.name}</p>
                        <p className="text-lg font-bold" style={{ color: h.color }}>{h.completionRate}%</p>
                        {h.streak > 0 && (
                          <p className="text-xs text-orange-500 flex items-center justify-center gap-1">
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
            <button onClick={() => setStep(2)} className="gtd-btn gtd-btn-secondary">Back</button>
            <button onClick={() => setStep(4)} className="gtd-btn gtd-btn-primary flex items-center gap-2">
              Next: Complete <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && (
        <div className="space-y-6">
          {done ? (
            <div className="gtd-card text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Review Complete!</h2>
              {resultStreak > 0 && (
                <p className="text-lg text-orange-500 flex items-center justify-center gap-2 mb-4">
                  <Flame className="w-6 h-6" /> {resultStreak} week streak!
                </p>
              )}
              <p className="text-gray-500 dark:text-gray-400">
                Your system is up to date. See you next week!
              </p>
              <Link to="/" className="gtd-btn gtd-btn-primary mt-6 inline-flex items-center gap-2">
                Back to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <div className="gtd-card">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Review Summary
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-2xl font-bold text-green-600">{markedComplete.size}</p>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-2xl font-bold text-blue-600">{markedMove.size}</p>
                    <p className="text-xs text-gray-500">Moved</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <p className="text-2xl font-bold text-red-600">{markedDelete.size}</p>
                    <p className="text-xs text-gray-500">Deleted</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <p className="text-2xl font-bold text-yellow-600">{reviewData.completedThisWeek}</p>
                    <p className="text-xs text-gray-500">Done this week</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="gtd-btn gtd-btn-secondary">Back</button>
                <button
                  onClick={handleCompleteReview}
                  disabled={completing}
                  className="gtd-btn gtd-btn-primary flex items-center gap-2"
                >
                  {completing ? 'Saving...' : 'Complete Review'}
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
