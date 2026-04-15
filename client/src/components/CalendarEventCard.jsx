import { CalendarDays, MapPin, ExternalLink } from 'lucide-react';

function formatTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'p' : 'a';
  const h = hours % 12 || 12;
  return `${h}:${minutes}${ampm}`;
}

export default function CalendarEventCard({ event, expanded = false }) {
  const handleClick = () => {
    if (event.html_link) {
      window.open(event.html_link, '_blank', 'noopener');
    }
  };

  const startTime = formatTime(event.start_time);
  const endTime = formatTime(event.end_time);
  const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : startTime || (event.all_day ? 'All day' : null);

  if (expanded) {
    return (
      <div
        onClick={handleClick}
        className="calendar-event-google gtd-card flex items-start gap-3 cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all"
      >
        <CalendarDays className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium break-words">{event.title}</div>
          {timeLabel && (
            <p className="text-sm mt-1 text-indigo-600 dark:text-indigo-400">{timeLabel}</p>
          )}
          {event.location && (
            <p className="text-sm text-indigo-500 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {event.location}
            </p>
          )}
        </div>
        <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-1.5 px-1.5 py-1 rounded text-xs cursor-pointer calendar-event-google hover:ring-1 hover:ring-indigo-400 transition-all"
    >
      <CalendarDays className="w-3 h-3 flex-shrink-0" />
      {timeLabel && !event.all_day && (
        <span className="flex-shrink-0 font-medium">{startTime}</span>
      )}
      <span className="truncate flex-1">{event.title}</span>
    </div>
  );
}
