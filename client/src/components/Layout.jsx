import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, FolderKanban, ListTodo, Clock, CloudSun,
  Sparkles, Target, LogOut, CheckCircle2, RotateCcw, CalendarDays,
  Command, Settings, MoreHorizontal, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuroraBackground from './AuroraBackground';
import CommandCapture from './CommandCapture';

const navGroups = [
  {
    label: 'workflow',
    items: [
      { to: '/',          icon: LayoutDashboard, label: 'Today' },
      { to: '/inbox',     icon: Inbox,           label: 'Inbox' },
      { to: '/projects',  icon: FolderKanban,    label: 'Projects' },
      { to: '/calendar',  icon: CalendarDays,    label: 'Calendar' },
    ],
  },
  {
    label: 'lists',
    items: [
      { to: '/lists/next_actions',  icon: ListTodo, label: 'Next Actions' },
      { to: '/lists/waiting_for',   icon: Clock,    label: 'Waiting For' },
      { to: '/lists/someday_maybe', icon: CloudSun, label: 'Someday/Maybe' },
    ],
  },
  {
    label: 'rituals',
    items: [
      { to: '/habits',    icon: Target,        label: 'Habits' },
      { to: '/review',    icon: RotateCcw,     label: 'Weekly Review' },
      { to: '/ai',        icon: Sparkles,      label: 'AI Assistant' },
      { to: '/completed', icon: CheckCircle2,  label: 'Completed' },
    ],
  },
  {
    label: 'system',
    items: [
      { to: '/settings',  icon: Settings,      label: 'Settings' },
    ],
  },
];

const mobileTabs = [
  { to: '/',          icon: LayoutDashboard, label: 'Today' },
  { to: '/inbox',     icon: Inbox,           label: 'Inbox' },
  { to: '/calendar',  icon: CalendarDays,    label: 'Calendar' },
  { to: '/projects',  icon: FolderKanban,    label: 'Projects' },
];

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || '·';
}

function NavItem({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => `
        group relative flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium
        transition-all duration-200
        ${isActive
          ? 'text-violet-100 pl-[14px]'
          : 'text-text-2 hover:text-text-1 hover:bg-white/[0.04]'}
      `}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <>
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-violet shadow-glow-violet" />
              <span className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, rgba(167,139,250,0.14), rgba(167,139,250,0.02))' }} />
            </>
          )}
          <Icon className="w-4 h-4 relative" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Cmd/Ctrl + K opens capture
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">
      <AuroraBackground />

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 relative z-20 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-[9px] grid place-items-center"
            style={{ background: 'linear-gradient(135deg, rgb(var(--violet)), rgb(var(--mint)))', boxShadow: '0 4px 14px -4px rgba(167,139,250,0.6)' }}
          >
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="font-display text-[18px] leading-none">flow</div>
        </div>
        <button
          onClick={() => setCaptureOpen(true)}
          className="glass glass-hover rounded-full px-3 py-1.5 flex items-center gap-2 text-[12px] text-text-2"
        >
          <Command className="w-3.5 h-3.5" /> capture
        </button>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col gap-1 px-4 py-6 relative z-20 border-r border-white/[0.05]">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <div
            className="w-8 h-8 rounded-[10px] grid place-items-center"
            style={{ background: 'linear-gradient(135deg, rgb(var(--violet)), rgb(var(--mint)))', boxShadow: '0 4px 14px -4px rgba(167,139,250,0.6)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-display text-[19px] leading-none">flow</div>
            <div className="mono-label mt-1">gtd</div>
          </div>
        </div>

        <button
          onClick={() => setCaptureOpen(true)}
          className="glass glass-hover flex items-center gap-2 px-3 py-2 mb-5 rounded-[11px] text-left"
        >
          <Command className="w-3.5 h-3.5 text-text-3" />
          <span className="text-[12.5px] text-text-3 flex-1">Quick capture</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-2">⌘K</span>
        </button>

        <nav className="flex-1 overflow-y-auto -mx-1 px-1">
          {navGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
              <div className="mono-label px-3 mb-2">{group.label}</div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} end={item.to === '/'} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div className="mt-4 glass rounded-2xl p-3 flex items-center gap-3">
          {user?.picture ? (
            <img src={user.picture} className="w-9 h-9 rounded-full" alt="" referrerPolicy="no-referrer" />
          ) : (
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-[11px] font-semibold text-bg"
              style={{ background: 'linear-gradient(135deg, rgb(var(--amber)), rgb(var(--rose)))' }}
            >
              {initialsOf(user?.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] truncate">{user?.name || 'Signed in'}</div>
            <div className="font-mono text-[10.5px] flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-mint shadow-glow-mint" />
              <span className="text-mint-glow">focused</span>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="grid place-items-center w-7 h-7 rounded-lg text-text-3 hover:text-text-1 hover:bg-white/5"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto relative z-10 pb-[76px] md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 z-30 glass rounded-2xl flex items-center px-2 py-2">
        {mobileTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${
              isActive ? 'text-violet-glow' : 'text-text-3'
            }`}
          >
            {({ isActive }) => (
              <>
                <t.icon className="w-[18px] h-[18px]" />
                <span className="font-mono text-[9.5px] tracking-wide">{t.label}</span>
                {isActive && <span className="absolute bottom-0 w-1 h-1 rounded-full bg-violet shadow-glow-violet" />}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-xl text-text-3"
        >
          <MoreHorizontal className="w-[18px] h-[18px]" />
          <span className="font-mono text-[9.5px] tracking-wide">More</span>
        </button>
      </nav>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 backdrop-blur-md" style={{ background: 'rgba(8,8,14,0.55)' }} />
          <div
            className="relative w-full glass rounded-t-3xl p-5 pb-8 animate-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="mono-label">more</div>
              <button onClick={() => setMoreOpen(false)} className="grid place-items-center w-7 h-7 rounded-lg border border-white/10">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {navGroups.flatMap(g => g.items)
                .filter(i => !mobileTabs.some(m => m.to === i.to))
                .map(i => <NavItem key={i.to} {...i} onClick={() => setMoreOpen(false)} />)}
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] text-text-2 hover:text-text-1 hover:bg-white/[0.04]"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </div>
  );
}
