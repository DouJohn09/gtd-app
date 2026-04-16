import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox,
  ListTodo,
  Clock,
  CloudSun,
  CheckCircle2,
  Target,
  Sparkles,
  ArrowRight,
  Flame
} from 'lucide-react';
import { api } from '../lib/api';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [dailyFocus, setDailyFocus] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchData = async () => {
    try {
      const [statsData, focusData, habitsData] = await Promise.all([
        api.tasks.getStats(),
        api.tasks.getDailyFocus(),
        api.habits.getAll()
      ]);
      setStats(statsData);
      setDailyFocus(focusData);
      setHabits(habitsData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
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

  const statCards = [
    { label: 'Inbox', value: stats?.inbox || 0, icon: Inbox, color: 'bg-yellow-500', link: '/inbox' },
    { label: 'Next Actions', value: stats?.next_actions || 0, icon: ListTodo, color: 'bg-green-500', link: '/lists/next_actions' },
    { label: 'Waiting For', value: stats?.waiting_for || 0, icon: Clock, color: 'bg-orange-500', link: '/lists/waiting_for' },
    { label: 'Someday/Maybe', value: stats?.someday_maybe || 0, icon: CloudSun, color: 'bg-blue-500', link: '/lists/someday_maybe' },
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Your GTD command center</p>
      </div>
      
      <div className="gtd-card mb-6">
        <h2 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Quick Capture</h2>
        <QuickCapture onCapture={fetchData} />
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, link }) => (
          <Link
            key={label}
            to={link}
            className="gtd-card flex items-center gap-3 hover:shadow-md transition-shadow overflow-hidden"
          >
            <div className={`${color} p-3 rounded-lg text-white shrink-0`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{label}</div>
            </div>
          </Link>
        ))}
      </div>
      
      {habits.length > 0 && (
        <div className="gtd-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Today's Habits
            </h2>
            <Link to="/habits" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${habits.length > 0 ? (habits.filter(h => h.completed_today).length / habits.length) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {habits.filter(h => h.completed_today).length}/{habits.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {habits.map(h => (
              <button
                key={h.id}
                onClick={async () => {
                  await api.habits.toggle(h.id);
                  fetchData();
                }}
                className="flex items-center gap-2.5 w-full text-left py-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 -mx-1"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  h.completed_today ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {h.completed_today && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${h.completed_today ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                  {h.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="gtd-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-600" />
              Today's Focus
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {stats?.completed_today || 0} completed today
            </span>
          </div>
          
          {dailyFocus.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No tasks in today's focus</p>
              <Link to="/ai" className="text-blue-600 hover:underline text-sm mt-2 inline-flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                Let AI suggest your focus
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyFocus.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={handleComplete}
                  onEdit={(t) => { setEditingTask(t); setShowModal(true); }}
                />
              ))}
            </div>
          )}
        </div>
        
        <div className="gtd-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Quick Actions
            </h2>
          </div>
          
          <div className="space-y-3">
            <Link 
              to="/inbox"
              className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Inbox className="w-5 h-5 text-yellow-600" />
                <span>Process Inbox</span>
              </div>
              <div className="flex items-center gap-2 text-yellow-700">
                <span className="font-medium">{stats?.inbox || 0} items</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
            
            <Link 
              to="/ai"
              className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>AI Process Inbox</span>
              </div>
              <ArrowRight className="w-4 h-4 text-purple-700" />
            </Link>
            
            <Link 
              to="/projects"
              className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ListTodo className="w-5 h-5 text-indigo-600" />
                <span>Review Projects</span>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-700" />
            </Link>
          </div>
        </div>
      </div>

      {showModal && <TaskModal task={editingTask} onClose={() => { setShowModal(false); setEditingTask(null); }} onSave={fetchData} />}
    </div>
  );
}
