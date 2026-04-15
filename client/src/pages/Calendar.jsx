import { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, PanelRightOpen, Link, Unlink } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import TaskModal from '../components/TaskModal';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import UnscheduledSidebar from '../components/calendar/UnscheduledSidebar';
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
  const [calendarLoading, setCalendarLoading] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();

  const dateKey = formatDateKey(currentDate);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Check Google Calendar connection status on mount
  useEffect(() => {
    if (user?.google_calendar_connected !== undefined) {
      setCalendarConnected(user.google_calendar_connected);
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
    // Add tasks
    for (const task of scheduledTasks) {
      const key = task.due_date;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    // Add Google events
    for (const event of googleEvents) {
      const key = event.due_date;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    // Sort each day: Google events first (all-day first, then by start_time), then tasks
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
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowModal(true);
  };

  const handleDropTask = async (taskId, newDate) => {
    try {
      await api.tasks.update(taskId, { due_date: newDate });
      addToast('Task rescheduled', 'success');
      fetchData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleModalSave = () => {
    setShowModal(false);
    setEditingTask(null);
    fetchData();
  };

  const connectGoogleCalendar = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    prompt: 'consent',
    onSuccess: async (response) => {
      setCalendarLoading(true);
      try {
        await api.calendar.connect(response.code);
        setCalendarConnected(true);
        addToast('Google Calendar connected', 'success');
        fetchData();
      } catch (err) {
        addToast('Failed to connect Google Calendar', 'error');
      } finally {
        setCalendarLoading(false);
      }
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
    } catch (err) {
      addToast('Failed to disconnect', 'error');
    } finally {
      setCalendarLoading(false);
    }
  };

  const getPeriodLabel = () => {
    if (viewType === 'month') {
      return `${getMonthName(month)} ${year}`;
    }
    if (viewType === 'week' && days.length === 7) {
      const startMonth = getShortMonthName(new Date(days[0].date + 'T00:00:00').getMonth());
      const endMonth = getShortMonthName(new Date(days[6].date + 'T00:00:00').getMonth());
      const startDay = days[0].day;
      const endDay = days[6].day;
      if (startMonth === endMonth) {
        return `${startMonth} ${startDay} - ${endDay}, ${year}`;
      }
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${dayNames[currentDate.getDay()]}, ${getMonthName(month)} ${currentDate.getDate()}, ${year}`;
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <CalendarDays className="w-8 h-8" />
          Calendar
        </h1>

        <div className="flex items-center gap-2">
          {/* Google Calendar connect/disconnect */}
          {calendarConnected ? (
            <button
              onClick={disconnectGoogleCalendar}
              disabled={calendarLoading}
              className="gtd-btn gtd-btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          ) : (
            <button
              onClick={() => connectGoogleCalendar()}
              disabled={calendarLoading}
              className="gtd-btn gtd-btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5"
            >
              <Link className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect Calendar</span>
            </button>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {VIEW_TYPES.map(v => (
              <button
                key={v}
                onClick={() => setViewType(v)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors
                  ${v === viewType
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden gtd-btn gtd-btn-secondary py-1.5 px-2"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={handlePrev} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={handleNext} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button onClick={handleToday} className="gtd-btn gtd-btn-secondary text-sm py-1 px-3">
          Today
        </button>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {getPeriodLabel()}
        </h2>
      </div>

      {/* Main content */}
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
            />
          )}
          {viewType === 'day' && (
            <DayView
              date={dateKey}
              items={itemsByDate[dateKey] || []}
              onEditTask={handleEdit}
              onCompleteTask={handleComplete}
              onDropTask={handleDropTask}
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

      {/* Task Modal */}
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
