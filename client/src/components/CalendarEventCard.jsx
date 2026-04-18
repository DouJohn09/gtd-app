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
    if (event.html_link) window.open(event.html_link, '_blank', 'noopener');
  };

  const startTime = formatTime(event.start_time);
  const endTime   = formatTime(event.end_time);
  const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : startTime || (event.all_day ? 'all day' : null);

  if (expanded) {
    return (
      <div
        onClick={handleClick}
        className="rounded-2xl glass glass-hover p-5 flex items-start gap-3 cursor-pointer relative overflow-hidden"
        style={{ borderColor: 'rgba(167,139,250,0.22)' }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ background: 'rgb(var(--violet))', boxShadow: '0 0 14px rgba(167,139,250,0.55)' }}
        />
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.22)' }}
        >
          <CalendarDays className="w-4 h-4 text-violet" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-medium break-words">{event.title}</div>
          {timeLabel && <p className="font-mono text-[11.5px] mt-1 text-violet-glow">{timeLabel}</p>}
          {event.location && (
            <p className="text-[12px] text-text-2 mt-1.5 inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {event.location}
            </p>
          )}
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-text-3 shrink-0 mt-1" />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] cursor-pointer relative overflow-hidden transition-all"
      style={{
        background: 'rgba(167,139,250,0.10)',
        border: '1px solid rgba(167,139,250,0.20)',
        color: 'rgb(var(--violet-glow))',
      }}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ background: 'rgb(var(--violet))' }}
      />
      <CalendarDays className="w-3 h-3 shrink-0 ml-1" />
      {startTime && !event.all_day && (
        <span className="font-mono text-[10.5px] shrink-0 text-violet">{startTime}</span>
      )}
      <span className="truncate flex-1">{event.title}</span>
    </div>
  );
}
