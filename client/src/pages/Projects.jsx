import { useState, useEffect } from 'react';
import { FolderKanban, Plus, Sparkles, ChevronRight, ChevronUp, ChevronDown, CheckCircle2, Trash2, ArrowRightLeft } from 'lucide-react';
import { api } from '../lib/api';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import { useToast } from '../components/Toast';

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
      fetchExpandedProject(projectId);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
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
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <FolderKanban className="w-8 h-8 text-indigo-500" />
            Projects
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Multi-step outcomes you're committed to</p>
        </div>
        <button onClick={() => setShowNewProject(true)} className="gtd-btn gtd-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {showNewProject && (
        <div className="gtd-card mb-6">
          <form onSubmit={handleCreateProject} className="space-y-4">
            <input type="text" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} className="gtd-input" placeholder="Project name" required />
            <textarea value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} className="gtd-input" placeholder="Description" />
            <input type="text" value={newProject.outcome} onChange={(e) => setNewProject({ ...newProject, outcome: e.target.value })} className="gtd-input" placeholder="Desired outcome" />
            <div>
              <label className="gtd-label">Execution Mode</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="execution_mode"
                    value="parallel"
                    checked={newProject.execution_mode === 'parallel'}
                    onChange={(e) => setNewProject({ ...newProject, execution_mode: e.target.value })}
                    className="text-blue-600"
                  />
                  <div>
                    <span className="text-sm font-medium">Parallel</span>
                    <span className="text-xs text-gray-400 ml-1">— all tasks active</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="execution_mode"
                    value="sequential"
                    checked={newProject.execution_mode === 'sequential'}
                    onChange={(e) => setNewProject({ ...newProject, execution_mode: e.target.value })}
                    className="text-blue-600"
                  />
                  <div>
                    <span className="text-sm font-medium">Sequential</span>
                    <span className="text-xs text-gray-400 ml-1">— one task at a time</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNewProject(false)} className="gtd-btn gtd-btn-secondary">Cancel</button>
              <button type="submit" className="gtd-btn gtd-btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FolderKanban className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map(project => (
            <div key={project.id} className="gtd-card">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => handleExpand(project.id)}>
                <div className="flex items-center gap-3">
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedProject === project.id ? 'rotate-90' : ''}`} />
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    {project.outcome && <p className="text-sm text-gray-500 dark:text-gray-400">{project.outcome}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {project.execution_mode === 'sequential' && (
                    <span className="gtd-badge bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs">
                      Sequential
                    </span>
                  )}
                  <span className="text-sm text-gray-500 dark:text-gray-400">{project.task_count} tasks</span>
                </div>
              </div>

              {expandedProject === project.id && (
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button onClick={() => handleAiBreakdown(project)} disabled={loadingAi} className="gtd-btn gtd-btn-secondary flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4" /> {loadingAi ? 'Analyzing...' : 'AI Breakdown'}
                    </button>
                    <button onClick={() => handleToggleMode(project)} className="gtd-btn gtd-btn-secondary flex items-center gap-2 text-sm">
                      <ArrowRightLeft className="w-4 h-4" />
                      {project.execution_mode === 'sequential' ? 'Switch to Parallel' : 'Switch to Sequential'}
                    </button>
                    <button onClick={() => handleDeleteProject(project.id)} className="gtd-btn text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>

                  {aiBreakdown?.projectId === project.id && (
                    <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-purple-900 dark:text-purple-300 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Breakdown</h4>
                      <ul className="mt-3 space-y-2">
                        {aiBreakdown.next_actions?.map((action, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-purple-400" /> {action.title}
                          </li>
                        ))}
                      </ul>
                      <button onClick={handleApplyBreakdown} className="gtd-btn gtd-btn-primary mt-4 text-sm">Apply Tasks</button>
                    </div>
                  )}

                  {expandedData && expandedData.id === project.id ? (
                    <div className="space-y-2">
                      {(() => {
                        const incompleteTasks = (expandedData.tasks || []).filter(t => t.list !== 'completed');
                        const isSequential = expandedData.execution_mode === 'sequential';

                        if (incompleteTasks.length === 0) {
                          return <p className="text-sm text-gray-400 py-2">No active tasks</p>;
                        }

                        return incompleteTasks.map((task, index) => {
                          const isQueued = isSequential && index > 0;
                          return (
                            <div key={task.id} className="flex items-start gap-1">
                              {isSequential && (
                                <div className="flex flex-col pt-3">
                                  <button
                                    onClick={() => handleMoveTask(project.id, expandedData.tasks, task.id, 'up')}
                                    disabled={index === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveTask(project.id, expandedData.tasks, task.id, 'down')}
                                    disabled={index === incompleteTasks.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-20"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                              <div className="flex-1">
                                <TaskCard
                                  task={task}
                                  onComplete={handleCompleteTask}
                                  onEdit={(t) => { setEditingTask(t); setShowModal(true); }}
                                  showList
                                  queued={isQueued}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && <TaskModal task={editingTask} projects={projects} onClose={() => { setShowModal(false); setEditingTask(null); }} onSave={() => { fetchProjects(); if (expandedProject) fetchExpandedProject(expandedProject); }} />}
    </div>
  );
}
