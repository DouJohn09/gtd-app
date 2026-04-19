import { useState, useEffect } from 'react';
import {
  FolderKanban, Plus, Sparkles, ChevronRight, ChevronUp, ChevronDown,
  Trash2, ArrowRightLeft, Clock, X, Check,
} from 'lucide-react';
import { api } from '../lib/api';
import TaskModal from '../components/TaskModal';
import { useToast } from '../components/Toast';
import GlassCard from '../components/ui/GlassCard';
import Chip from '../components/ui/Chip';
import MonoLabel from '../components/ui/MonoLabel';
import FreshCheck from '../components/ui/FreshCheck';

const TONE_CYCLE = ['violet', 'mint', 'amber', 'rose'];
const toneFor = (id) => TONE_CYCLE[(Number(id) || 0) % TONE_CYCLE.length];

export default function Projects() {
  const { addToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedProject, setExpandedProject] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [newProject, setNewProject] = useState({ name: '', description: '', outcome: '', execution_mode: 'parallel' });
  const [aiBreakdown, setAiBreakdown] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchProjects = async () => {
    try {
      const data = await api.projects.getAll();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpandedProject = async (id) => {
    try {
      const data = await api.projects.getById(id);
      setExpandedData(data);
    } catch (error) {
      console.error('Failed to fetch project details:', error);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleExpand = (projectId) => {
    if (expandedProject === projectId) {
      setExpandedProject(null);
      setExpandedData(null);
    } else {
      setExpandedProject(projectId);
      setExpandedData(null);
      fetchExpandedProject(projectId);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    await api.projects.create(newProject);
    setNewProject({ name: '', description: '', outcome: '', execution_mode: 'parallel' });
    setShowNewProject(false);
    fetchProjects();
  };

  const handleDeleteProject = async (id) => {
    if (confirm('Delete this project?')) {
      await api.projects.delete(id);
      setExpandedProject(null);
      setExpandedData(null);
      fetchProjects();
    }
  };

  const handleToggleMode = async (project) => {
    const newMode = project.execution_mode === 'sequential' ? 'parallel' : 'sequential';
    await api.projects.update(project.id, { execution_mode: newMode });
    fetchProjects();
    fetchExpandedProject(project.id);
    addToast(`Switched to ${newMode} mode`, 'success');
  };

  const handleAiBreakdown = async (project) => {
    setLoadingAi(true);
    setExpandedProject(project.id);
    try {
      const breakdown = await api.projects.breakdown(project.id);
      setAiBreakdown({ projectId: project.id, ...breakdown });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplyBreakdown = async () => {
    if (!aiBreakdown) return;
    await api.projects.applyBreakdown(aiBreakdown.projectId, aiBreakdown.next_actions);
    setAiBreakdown(null);
    fetchProjects();
    fetchExpandedProject(aiBreakdown.projectId);
  };

  const handleCompleteTask = async (taskId) => {
    await api.tasks.complete(taskId);
    fetchProjects();
    if (expandedProject) fetchExpandedProject(expandedProject);
  };

  const handleMoveTask = async (projectId, tasks, taskId, direction) => {
    const incomplete = tasks.filter(t => t.list !== 'completed');
    const index = incomplete.findIndex(t => t.id === taskId);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= incomplete.length) return;

    const reordered = [...incomplete];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];

    await api.projects.reorder(projectId, reordered.map(t => t.id));
    fetchExpandedProject(projectId);
  };

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <MonoLabel className="mb-3">multi-step outcomes</MonoLabel>
          <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">
            Projects
            {!loading && (
              <span className="ml-3 font-mono text-[18px] text-text-3 align-middle">
                {projects.length}
              </span>
            )}
          </h1>
          <p className="mt-3 text-[14.5px] text-text-2 max-w-md">
            Anything that takes more than one action. Sequential to enforce order, parallel to keep options open.
          </p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New project
        </button>
      </div>

      {/* New project form */}
      {showNewProject && (
        <GlassCard className="mb-6 fresh-stagger" padded={false}>
          <form onSubmit={handleCreateProject} className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <MonoLabel>new project</MonoLabel>
              <button type="button" onClick={() => setShowNewProject(false)}
                      className="grid place-items-center w-7 h-7 rounded-lg border border-white/10 hover:bg-white/5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              className="gtd-input font-display text-[22px] tracking-tight"
              placeholder="Project name"
              required
              autoFocus
            />
            <textarea
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              className="gtd-input min-h-[60px]"
              placeholder="Why does this matter? (optional)"
            />
            <input
              type="text"
              value={newProject.outcome}
              onChange={(e) => setNewProject({ ...newProject, outcome: e.target.value })}
              className="gtd-input"
              placeholder='Desired outcome (e.g. "Brief shipped to stakeholders")'
            />

            <div>
              <MonoLabel className="mb-2">execution mode</MonoLabel>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: 'parallel',   label: 'Parallel',   sub: 'all tasks active at once' },
                  { v: 'sequential', label: 'Sequential', sub: 'one task at a time' },
                ].map(opt => (
                  <button
                    type="button"
                    key={opt.v}
                    onClick={() => setNewProject({ ...newProject, execution_mode: opt.v })}
                    className="text-left rounded-xl p-3 transition-all"
                    style={{
                      background: newProject.execution_mode === opt.v ? 'rgba(167,139,250,0.10)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${newProject.execution_mode === opt.v ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <div className="text-[13.5px] font-medium">{opt.label}</div>
                    <div className="font-mono text-[10.5px] text-text-3 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowNewProject(false)} className="gtd-btn gtd-btn-secondary">
                Cancel
              </button>
              <button type="submit" className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Create
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <GlassCard className="py-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: 'radial-gradient(circle at 50% 30%, rgba(167,139,250,0.10), transparent 60%)' }} />
          <div className="relative">
            <div className="font-mono text-[11px] text-text-3 mb-3">no_projects_yet</div>
            <div className="font-display italic text-[26px] mb-2">Pick something worth committing to.</div>
            <p className="text-[13.5px] text-text-2 max-w-sm mx-auto mb-6">
              Projects collect related tasks under a single outcome — anything bigger than a one-shot action.
            </p>
            <button onClick={() => setShowNewProject(true)} className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create first project
            </button>
          </div>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3 fresh-stagger">
          {projects.map(project => {
            const isOpen = expandedProject === project.id;
            const tone = toneFor(project.id);
            const tint = (a) => `rgb(var(--${tone}) / ${a})`;

            return (
              <GlassCard key={project.id} padded={false}>
                {/* Header row */}
                <button
                  onClick={() => handleExpand(project.id)}
                  className="w-full text-left p-5 flex items-center gap-4"
                >
                  <div
                    className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                    style={{ background: tint(0.10), border: `1px solid ${tint(0.22)}` }}
                  >
                    <FolderKanban className="w-4 h-4" style={{ color: `rgb(var(--${tone}))` }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-[20px] leading-tight truncate">{project.name}</div>
                    {project.outcome && (
                      <div className="text-[12.5px] text-text-2 truncate mt-0.5">{project.outcome}</div>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    {project.execution_mode === 'sequential' && (
                      <Chip tone="amber">sequential</Chip>
                    )}
                    <Chip>{project.task_count ?? 0} tasks</Chip>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-text-3 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-5 pb-5 -mt-1">
                    {/* Action toolbar */}
                    <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-white/[0.05]">
                      <button
                        onClick={() => handleAiBreakdown(project)}
                        disabled={loadingAi}
                        className="gtd-btn gtd-btn-secondary inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {loadingAi ? 'Analyzing…' : 'AI breakdown'}
                      </button>
                      <button
                        onClick={() => handleToggleMode(project)}
                        className="gtd-btn gtd-btn-secondary inline-flex items-center gap-1.5 text-[12.5px]"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        {project.execution_mode === 'sequential' ? 'Switch to parallel' : 'Switch to sequential'}
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="gtd-btn inline-flex items-center gap-1.5 text-[12.5px] text-rose hover:text-rose-glow ml-auto"
                        style={{ background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.18)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>

                    {/* AI breakdown panel */}
                    {aiBreakdown?.projectId === project.id && (
                      <GlassCard className="mb-4 relative overflow-hidden" padded={false}>
                        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
                             style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.18), transparent 70%)' }} />
                        <div className="p-5 relative">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-3.5 h-3.5 text-violet" />
                            <MonoLabel tone="violet">ai breakdown</MonoLabel>
                          </div>
                          <ul className="space-y-2 mb-4">
                            {aiBreakdown.next_actions?.map((action, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                                <span className="font-mono text-[10.5px] text-text-3 mt-1.5 w-5">{String(i + 1).padStart(2, '0')}</span>
                                <span className="text-text-1">{action.title}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center gap-2">
                            <button onClick={handleApplyBreakdown} className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px]">
                              <Check className="w-3.5 h-3.5" /> Apply tasks
                            </button>
                            <button onClick={() => setAiBreakdown(null)} className="gtd-btn gtd-btn-secondary text-[12.5px]">
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    )}

                    {/* Task list */}
                    {expandedData && expandedData.id === project.id ? (
                      <ProjectTaskList
                        project={project}
                        expandedData={expandedData}
                        onComplete={handleCompleteTask}
                        onEdit={(t) => { setEditingTask(t); setShowModal(true); }}
                        onMove={(taskId, dir) => handleMoveTask(project.id, expandedData.tasks, taskId, dir)}
                      />
                    ) : (
                      <div className="flex justify-center py-6">
                        <div className="w-5 h-5 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editingTask}
          projects={projects}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={() => { fetchProjects(); if (expandedProject) fetchExpandedProject(expandedProject); }}
        />
      )}
    </div>
  );
}

/* ============================================================ */

function ProjectTaskList({ project, expandedData, onComplete, onEdit, onMove }) {
  const [optimisticDone, setOptimisticDone] = useState(new Set());
  const tasks = (expandedData.tasks || []).filter(t => t.list !== 'completed');
  const isSequential = expandedData.execution_mode === 'sequential';

  const completedAll = expandedData.tasks?.filter(t => t.list === 'completed').length || 0;
  const totalEver = (expandedData.tasks || []).length;
  const pct = totalEver ? Math.round((completedAll / totalEver) * 100) : 0;

  if (tasks.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="font-mono text-[11px] text-text-3 mb-1.5">no_active_tasks</div>
        <div className="text-[13px] text-text-2">All caught up — add a next action or run an AI breakdown.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Tiny progress strip */}
      <div className="flex items-center gap-3 mb-3">
        <MonoLabel className="shrink-0">tasks</MonoLabel>
        <div className="flex-1 h-[2px] rounded-full overflow-hidden bg-white/[0.05]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'rgb(var(--mint))', boxShadow: '0 0 10px rgba(94,234,212,0.5)' }}
          />
        </div>
        <span className="font-mono text-[10.5px] text-text-3">
          {completedAll}/{totalEver}
        </span>
      </div>

      <div className="flex flex-col">
        {tasks.map((task, index) => {
          const isQueued = isSequential && index > 0;
          const isOptDone = optimisticDone.has(task.id);
          return (
            <div
              key={task.id}
              className={`group flex items-start gap-3 py-3 ${index === 0 ? '' : 'border-t border-white/[0.04]'}`}
              style={{ opacity: isQueued ? 0.55 : 1 }}
            >
              <FreshCheck
                checked={isOptDone}
                onChange={() => {
                  setOptimisticDone(prev => new Set(prev).add(task.id));
                  setTimeout(() => onComplete(task.id), 380);
                }}
                className="mt-0.5"
                size={20}
              />

              {isSequential && (
                <div className="flex flex-col -mt-0.5">
                  <button
                    onClick={() => onMove(task.id, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-text-3 hover:text-text-1 disabled:opacity-20"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onMove(task.id, 'down')}
                    disabled={index === tasks.length - 1}
                    className="p-0.5 text-text-3 hover:text-text-1 disabled:opacity-20"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button onClick={() => onEdit(task)} className="flex-1 min-w-0 text-left">
                <div className={`text-[14px] leading-snug [overflow-wrap:anywhere] ${isOptDone ? 'line-through opacity-50' : ''}`}>
                  {isQueued && <span className="font-mono text-[10.5px] text-text-3 mr-2">queued</span>}
                  {task.title}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {task.context && <Chip tone="violet">@{task.context}</Chip>}
                  {task.due_date && (
                    <Chip>
                      <Clock className="w-3 h-3" />
                      {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Chip>
                  )}
                  {task.list && task.list !== 'next_actions' && (
                    <Chip>{task.list.replace('_', ' ')}</Chip>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
