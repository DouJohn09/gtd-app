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
  ArrowRight
} from 'lucide-react';
import { api } from '../lib/api';
import QuickCapture from '../components/QuickCapture';
import TaskCard from '../components/TaskCard';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [dailyFocus, setDailyFocus] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsData, focusData] = await Promise.all([
        api.tasks.getStats(),
        api.tasks.getDailyFocus()
      ]);
      setStats(statsData);
      setDailyFocus(focusData);
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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Your GTD command center</p>
      </div>
      
      <div className="gtd-card mb-6">
        <h2 className="font-medium text-gray-700 mb-3">Quick Capture</h2>
        <QuickCapture onCapture={fetchData} />
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, link }) => (
          <Link
            key={label}
            to={link}
            className="gtd-card flex items-center gap-4 hover:shadow-md transition-shadow"
          >
            <div className={`${color} p-3 rounded-lg text-white`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-sm text-gray-500">{label}</div>
            </div>
          </Link>
        ))}
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="gtd-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-600" />
              Today's Focus
            </h2>
            <span className="text-sm text-gray-500">
              {stats?.completed_today || 0} completed today
            </span>
          </div>
          
          {dailyFocus.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
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
              className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
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
              className="flex items-center justify-between p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <span>AI Process Inbox</span>
              </div>
              <ArrowRight className="w-4 h-4 text-purple-700" />
            </Link>
            
            <Link 
              to="/projects"
              className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
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
    </div>
  );
}
