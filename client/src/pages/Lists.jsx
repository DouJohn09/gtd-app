import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTodo, Clock, CloudSun, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';

const listConfig = {
  next_actions: { title: 'Next Actions', icon: ListTodo, color: 'text-green-500', description: 'Clear, physical actions you can do right now' },
  waiting_for: { title: 'Waiting For', icon: Clock, color: 'text-orange-500', description: 'Items delegated to others' },
  someday_maybe: { title: 'Someday/Maybe', icon: CloudSun, color: 'text-blue-500', description: 'Ideas for the future' }
};

export default function Lists() {
  const { list } = useParams();
  const config = listConfig[list] || listConfig.next_actions;
  const Icon = config.icon;

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('priority');

  const fetchData = async () => {
    setLoading(true);
    const [tasksData, projectsData] = await Promise.all([api.tasks.getAll(list), api.projects.getAll()]);
    setTasks(tasksData);
    setProjects(projectsData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [list]);

  const handleComplete = async (id) => { await api.tasks.complete(id); fetchData(); };
  const handleDelete = async (id) => { if (confirm('Delete?')) { await api.tasks.delete(id); fetchData(); } };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);

  const groupedByContext = list === 'next_actions' && sortBy === 'priority' ? sortedTasks.reduce((acc, task) => {
    const ctx = task.context || 'No Context';
    if (!acc[ctx]) acc[ctx] = [];
    acc[ctx].push(task);
    return acc;
  }, {}) : null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className={`text-2xl font-bold flex items-center gap-3`}><Icon className={`w-8 h-8 ${config.color}`} />{config.title}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{config.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <SortDropdown value={sortBy} onChange={setSortBy} />
          <button onClick={() => { setEditingTask({ list }); setShowModal(true); }} className="gtd-btn gtd-btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : sortedTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500"><Icon className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>No items here</p></div>
      ) : groupedByContext ? (
        <div className="space-y-6">
          {Object.entries(groupedByContext).map(([context, contextTasks]) => (
            <div key={context}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase">{context}</h3>
              <div className="space-y-3">
                {contextTasks.map(task => (
                  <div key={task.id} className="group relative">
                    <TaskCard task={task} onComplete={handleComplete} onEdit={(t) => { setEditingTask(t); setShowModal(true); }} />
                    <button onClick={() => handleDelete(task.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map(task => (
            <div key={task.id} className="group relative">
              <TaskCard task={task} onComplete={handleComplete} onEdit={(t) => { setEditingTask(t); setShowModal(true); }} />
              <button onClick={() => handleDelete(task.id)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {showModal && <TaskModal task={editingTask} projects={projects} onClose={() => { setShowModal(false); setEditingTask(null); }} onSave={fetchData} />}
    </div>
  );
}
