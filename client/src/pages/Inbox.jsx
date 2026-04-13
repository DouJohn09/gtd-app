import { useState, useEffect, useMemo } from 'react';
import { Inbox as InboxIcon, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import SortDropdown, { sortTasks } from '../components/SortDropdown';

export default function Inbox() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('date_added_newest');

  const fetchData = async () => {
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.tasks.getAll('inbox'),
        api.projects.getAll()
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleComplete = async (id) => {
    await api.tasks.complete(id);
    fetchData();
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this task?')) {
      await api.tasks.delete(id);
      fetchData();
    }
  };

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <InboxIcon className="w-8 h-8 text-yellow-500" />
          Inbox
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Capture everything, process later. Get it out of your head!
        </p>
      </div>
      
      <div className="gtd-card mb-6">
        <QuickCapture onCapture={fetchData} />
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-300">GTD Tip: Processing Inbox</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              For each item ask: Is it actionable? If yes, what's the next action? 
              If it takes less than 2 minutes, do it now. Otherwise, delegate it or defer it to Next Actions.
            </p>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <InboxIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-xl font-medium">Inbox Zero!</p>
          <p className="mt-2">Your mind is clear. Capture new items above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 px-2">
            <span>{sortedTasks.length} items to process</span>
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>

          {sortedTasks.map(task => (
            <div key={task.id} className="group relative">
              <TaskCard 
                task={task} 
                onComplete={handleComplete}
                onEdit={handleEdit}
              />
              <button
                onClick={() => handleDelete(task.id)}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {showModal && (
        <TaskModal
          task={editingTask}
          projects={projects}
          onClose={() => {
            setShowModal(false);
            setEditingTask(null);
          }}
          onSave={fetchData}
        />
      )}
    </div>
  );
}
