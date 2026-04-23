import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, PanelRightOpen, Link as LinkIcon, Unlink, AlertCircle } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import TaskModal from '../components/TaskModal';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import UnscheduledSidebar from '../components/calendar/UnscheduledSidebar';
import MonoLabel from '../components/ui/MonoLabel';
import {
  formatDateKey,
  getMonthDays,
  getWeekDays,
  getDateRangeForView,
  getMonthName,
  getShortMonthName,
} from '../lib/dateUtils';

const VIEW_TYPES = ['month', 'week', 'day'];

export default function Calendar() {
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewType, setViewType] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [hasWriteScope, setHasWriteScope] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();

  const dateKey = formatDateKey(currentDate);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (user?.google_calendar_connected !== undefined) {
      setCalendarConnected(user.google_calendar_connected);
    }
    if (user?.google_calendar_write !== undefined) {
      setHasWriteScope(user.google_calendar_write);
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    try {
      const { start, end } = getDateRangeForView(viewType, currentDate);
      const [calendarData, projectsData] = await Promise.all([
        api.tasks.getCalendar(start, end),
        api.projects.getAll(),
      ]);
      setScheduledTasks(calendarData.scheduled);
      setUnscheduledTasks(calendarData.unscheduled);
      setGoogleEvents(calendarData.googleEvents || []);
      setProjects(projectsData);
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [viewType, dateKey]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const itemsByDate = useMemo(() => {
    const map = {};
    for (const task of scheduledTasks) {
      const key = task.due_date;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(task);
      }
      if (task.start_date && task.start_date !== key) {
        if (!map[task.start_date]) map[task.start_date] = [];
        map[task.start_date].push({ ...task, _calendarDate: 'start' });
      }
    }
    for (const event of googleEvents) {
      const key = event.due_date;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const aIsEvent = a.type === 'google_event';
        const bIsEvent = b.type === 'google_event';
        if (aIsEvent && !bIsEvent) return -1;
        if (!aIsEvent && bIsEvent) return 1;
        if (aIsEvent && bIsEvent) {
          if (a.all_day && !b.all_day) return -1;
          if (!a.all_day && b.all_day) return 1;
          return (a.start_time || '').localeCompare(b.start_time || '');
        }
        return 0;
      });
    }
    return map;
  }, [scheduledTasks, googleEvents]);

  const days = useMemo(() => {
    if (viewType === 'month') return getMonthDays(year, month);
    if (viewType === 'week') return getWeekDays(currentDate);
    return [];
  }, [viewType, year, month, dateKey]);

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewType === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };
  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewType === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewType === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };
  const handleToday = () => setCurrentDate(new Date());
  const handleDayClick = (date) => {
    setCurrentDate(new Date(date + 'T00:00:00'));
    setViewType('day');
  };

  const handleComplete = async (id) => {
    try {
      await api.tasks.complete(id);
      addToast('Task completed', 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEdit = (task) => { setEditingTask(task); setShowModal(true); };

  const handleDropTask = async (taskId, newDate, newTime = undefined) => {
    try {
      const updates = { due_date: newDate };
      if (newTime !== undefined) {
        updates.scheduled_time = newTime;
        if (newTime && !scheduledTasks.find(t => t.id === taskId)?.duration) {
          updates.duration = 60;
        }
      }
      await api.tasks.update(taskId, updates);
      addToast(newTime ? 'Task time-blocked' : 'Task rescheduled', 'success');
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      await api.tasks.update(taskId, updates);
      fetchData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleModalSave = () => {
    setShowModal(false);
    setEditingTask(null);
    fetchData();
  };

  const connectGoogleCalendar = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar',
    prompt: 'consent',
    onSuccess: async (response) => {
      setCalendarLoading(true);
      try {
        const result = await api.calendar.connect(response.code);
        setCalendarConnected(true);
        setHasWriteScope(!!result?.hasWriteScope);
        addToast(result?.hasWriteScope ? 'Google Calendar connected — time blocks will sync' : 'Google Calendar connected (read-only)', 'success');
        fetchData();
      } catch {
        addToast('Failed to connect Google Calendar', 'error');
      } finally { setCalendarLoading(false); }
    },
    onError: () => addToast('Google Calendar connection failed', 'error'),
  });

  const disconnectGoogleCalendar = async () => {
    setCalendarLoading(true);
    try {
      await api.calendar.disconnect();
      setCalendarConnected(false);
      setGoogleEvents([]);
      addToast('Google Calendar disconnected', 'success');
    } catch { addToast('Failed to disconnect', 'error'); }
    finally { setCalendarLoading(false); }
  };

  const getPeriodLabel = () => {
    if (viewType === 'month') return `${getMonthName(month)} ${year}`;
    if (viewType === 'week' && days.length === 7) {
      const startMonth = getShortMonthName(new Date(days[0].date + 'T00:00:00').getMonth());
      const endMonth = getShortMonthName(new Date(days[6].date + 'T00:00:00').getMonth());
      const startDay = days[0].day;
      const endDay = days[6].day;
      if (startMonth === endMonth) return `${startMonth} ${startDay} – ${endDay}, ${year}`;
      return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${dayNames[currentDate.getDay()]}, ${getMonthName(month)} ${currentDate.getDate()}, ${year}`;
  };

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1500px]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <MonoLabel className="mb-3">schedule</MonoLabel>
          <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">Calendar</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Google Calendar */}
          {calendarConnected ? (
            <button
              onClick={disconnectGoogleCalendar}
              disabled={calendarLoading}
              className="gtd-btn gtd-btn-secondary inline-flex items-center gap-1.5 text-[12.5px]"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect Google</span>
            </button>
          ) : (
            <button
              onClick={() => connectGoogleCalendar()}
              disabled={calendarLoading}
              className="gtd-btn gtd-btn-secondary inline-flex items-center gap-1.5 text-[12.5px]"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect Google</span>
            </button>
          )}

          {/* View segmented */}
          <div className="rounded-xl glass p-1 flex">
            {VIEW_TYPES.map(v => {
              const active = v === viewType;
              return (
                <button
                  key={v}
                  onClick={() => setViewType(v)}
                  className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider rounded-lg transition-all"
                  style={
                    active
                      ? { background: 'rgb(var(--violet) / 0.18)', color: 'rgb(var(--violet-glow))', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.3)' }
                      : { color: 'rgb(var(--text-3))' }
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden gtd-btn gtd-btn-secondary py-1.5 px-2"
            title="Unscheduled tasks"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Re-consent banner: connected but no write scope */}
      {calendarConnected && !hasWriteScope && (
        <div
          className="rounded-2xl glass p-4 mb-5 flex items-start gap-3"
          style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--amber) / 0.28)', background: 'rgb(var(--amber) / 0.06)' }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgb(var(--amber-glow))' }} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-text-1">
              Reconnect Google to push time blocks to your calendar
            </div>
            <p className="font-mono text-[11px] text-text-3 mt-1 leading-relaxed">
              You're connected with read-only access. Reconnect with write access and we'll push your time blocks to a dedicated <span style={{ color: 'rgb(var(--violet-glow))' }}>GTD Flow</span> calendar — your primary calendar stays untouched.
            </p>
          </div>
          <button
            onClick={() => connectGoogleCalendar()}
            disabled={calendarLoading}
            className="gtd-btn gtd-btn-primary text-[12px]"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Period nav */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handlePrev} className="grid place-items-center w-9 h-9 rounded-xl glass glass-hover">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={handleNext} className="grid place-items-center w-9 h-9 rounded-xl glass glass-hover">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleToday}
          className="font-mono text-[11px] uppercase tracking-wider px-3 py-2 rounded-xl glass glass-hover text-text-2 hover:text-text-1"
        >
          today
        </button>
        <h2 className="font-display text-[24px] md:text-[28px] leading-none ml-2">
          {getPeriodLabel()}
        </h2>
      </div>

      {/* Main */}
      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-violet/30 border-t-violet animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            {viewType === 'month' && (
              <MonthView
                days={days}
                itemsByDate={itemsByDate}
                onEditTask={handleEdit}
                onCompleteTask={handleComplete}
                onDropTask={handleDropTask}
                onDayClick={handleDayClick}
              />
            )}
            {viewType === 'week' && (
              <WeekView
                days={days}
                itemsByDate={itemsByDate}
                onEditTask={handleEdit}
                onCompleteTask={handleComplete}
                onDropTask={handleDropTask}
                onDayClick={handleDayClick}
                onUpdateTask={handleUpdateTask}
              />
            )}
            {viewType === 'day' && (
              <DayView
                date={dateKey}
                items={itemsByDate[dateKey] || []}
                onEditTask={handleEdit}
                onCompleteTask={handleComplete}
                onDropTask={handleDropTask}
                onUpdateTask={handleUpdateTask}
              />
            )}
          </div>

          <UnscheduledSidebar
            tasks={unscheduledTasks}
            onEditTask={handleEdit}
            onCompleteTask={handleComplete}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editingTask}
          projects={projects}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
