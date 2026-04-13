import { useState, useEffect } from 'react';
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

export default function CompletedTasks() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await api.tasks.getAll('completed');
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch completed tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRestore = async (id) => {
    try {
      await api.tasks.update(id, { list: 'inbox', completed_at: null });
      addToast('Task restored to inbox', 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Permanently delete this task?')) return;
    try {
      await api.tasks.delete(id);
      addToast('Task deleted', 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  // Group tasks by completion date
  const grouped = tasks.reduce((acc, task) => {
    const date = task.completed_at ? task.completed_at.split('T')[0] : 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
          Completed Tasks
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} completed
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="gtd-card text-center py-12 text-gray-500 dark:text-gray-400">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-xl font-medium">No completed tasks yet</p>
          <p className="mt-2">Tasks you complete will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateTasks]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                {formatDate(date + 'T00:00:00')}
                <span className="ml-2 normal-case tracking-normal text-gray-400 dark:text-gray-500">
                  {date}
                </span>
              </h3>
              <div className="space-y-2">
                {dateTasks.map(task => (
                  <div key={task.id} className="gtd-card flex items-center gap-3 group">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-500 dark:text-gray-400 line-through">{task.title}</div>
                      {task.project_name && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{task.project_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRestore(task.id)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Restore to inbox"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
