import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  ListTodo,
  Clock,
  Sparkles,
  CloudSun,
  Target,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useTheme from '../hooks/useTheme';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inbox', icon: Inbox, label: 'Inbox' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/lists/next_actions', icon: ListTodo, label: 'Next Actions' },
  { to: '/lists/waiting_for', icon: Clock, label: 'Waiting For' },
  { to: '/lists/someday_maybe', icon: CloudSun, label: 'Someday/Maybe' },
  { to: '/habits', icon: Target, label: 'Habits' },
  { to: '/completed', icon: CheckCircle2, label: 'Completed' },
  { to: '/review', icon: RotateCcw, label: 'Weekly Review' },
  { to: '/ai', icon: Sparkles, label: 'AI Assistant' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-gray-900 text-white px-4 py-3">
        <button onClick={() => setSidebarOpen(true)} className="p-1">
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ListTodo className="w-5 h-5" />
          GTD Flow
        </h1>
        <button onClick={toggleTheme} className="p-1">
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:z-auto
      `}>
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ListTodo className="w-6 h-6" />
            GTD Flow
          </h1>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3">
            {user?.picture && <img src={user.picture} className="w-8 h-8 rounded-full" alt="" referrerPolicy="no-referrer" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{user?.name}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email}</div>
            </div>
            <button onClick={toggleTheme} className="text-gray-400 hover:text-white" title={isDark ? 'Light mode' : 'Dark mode'}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={logout} className="text-gray-400 hover:text-white" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
