import { useState, useEffect } from 'react';
import { FolderKanban, Plus, Sparkles, ChevronRight, CheckCircle2, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import TaskCard from '../components/TaskCard';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedProject, setExpandedProject] = useState(null);
  const [newProject, setNewProject] = useState({ name: '', description: '', outcome: '' });
  const [aiBreakdown, setAiBreakdown] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

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

  useEffect(() => { fetchProjects(); }, []);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    await api.projects.create(newProject);
    setNewProject({ name: '', description: '', outcome: '' });
    setShowNewProject(false);
    fetchProjects();
  };

  const handleDeleteProject = async (id) => {
    if (confirm('Delete this project?')) {
      await api.projects.delete(id);
      fetchProjects();
    }
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
  };

  const handleCompleteTask = async (taskId) => {
    await api.tasks.complete(taskId);
    fetchProjects();
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <FolderKanban className="w-8 h-8 text-indigo-500" />
            Projects
          </h1>
          <p className="text-gray-500 mt-1">Multi-step outcomes you're committed to</p>
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
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}>
                <div className="flex items-center gap-3">
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedProject === project.id ? 'rotate-90' : ''}`} />
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    {project.outcome && <p className="text-sm text-gray-500">{project.outcome}</p>}
                  </div>
                </div>
                <span className="text-sm text-gray-500">{project.task_count} tasks</span>
              </div>

              {expandedProject === project.id && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => handleAiBreakdown(project)} disabled={loadingAi} className="gtd-btn gtd-btn-secondary flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4" /> {loadingAi ? 'Analyzing...' : 'AI Breakdown'}
                    </button>
                    <button onClick={() => handleDeleteProject(project.id)} className="gtd-btn text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>

                  {aiBreakdown?.projectId === project.id && (
                    <div className="bg-purple-50 rounded-lg p-4 mb-4">
                      <h4 className="font-medium text-purple-900 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Breakdown</h4>
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

                  {project.tasks?.filter(t => t.list !== 'completed').map(task => (
                    <TaskCard key={task.id} task={task} onComplete={handleCompleteTask} showList />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
