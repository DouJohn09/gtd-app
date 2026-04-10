import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  ListTodo,
  Clock,
  Sparkles,
  CloudSun,
  LogOut
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inbox', icon: Inbox, label: 'Inbox' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/lists/next_actions', icon: ListTodo, label: 'Next Actions' },
  { to: '/lists/waiting_for', icon: Clock, label: 'Waiting For' },
  { to: '/lists/someday_maybe', icon: CloudSun, label: 'Someday/Maybe' },
  { to: '/ai', icon: Sparkles, label: 'AI Assistant' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ListTodo className="w-6 h-6" />
            GTD Flow
          </h1>
          <p className="text-gray-400 text-sm mt-1">Getting Things Done</p>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
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
