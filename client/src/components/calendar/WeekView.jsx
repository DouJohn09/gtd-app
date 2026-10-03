import { useState, useRef, useEffect } from 'react';
import CalendarTaskCard from '../CalendarTaskCard';
import CalendarEventCard from '../CalendarEventCard';
import TimeGrid, { HOUR_START, HOUR_END, COMPACT_HOUR_HEIGHT, timeToMinutes, formatTimeLabel } from './TimeGrid';

const GUTTER = 40;
const SCROLL_HEIGHT = 560;
const COLUMNS = `${GUTTER}px repeat(7, minmax(0, 1fr))`;

function googleEventToBlock(event) {
  if (event.all_day || !event.start_time) return null;
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const scheduled_time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const duration = end ? Math.max(15, Math.round((end - start) / 60000)) : 60;
  return { ...event, scheduled_time, duration };
}

function splitItems(items) {
  const timeBlocks = items.flatMap(i => {
    if (i.type === 'google_event') {
      const block = googleEventToBlock(i);
      return block ? [block] : [];
    }
    return i.scheduled_time ? [i] : [];
  });
  const allDayItems = items.filter(i =>
    i.type === 'google_event' ? i.all_day : !i.scheduled_time
  );
  return { timeBlocks, allDayItems };
}

function ItemCard({ item, onEditTask, onCompleteTask }) {
  return item.type === 'google_event' ? (
    <CalendarEventCard event={item} />
  ) : (
    <CalendarTaskCard task={item} onEdit={onEditTask} onComplete={onCompleteTask} />
  );
}

function DayHeader({ dayName, day, isToday, onClick }) {
  return (
    <button onClick={onClick} className="text-center mb-2 cursor-pointer w-full">
      <div className="mono-label text-[9.5px]">{dayName}</div>
      <div
        className="font-display text-[18px] leading-none mt-1 inline-grid place-items-center w-7 h-7 rounded-full"
        style={
          isToday
            ? { background: 'rgb(var(--violet))', color: '#0a0a0f', boxShadow: '0 0 14px rgba(167,139,250,0.55)' }
            : {}
        }
      >
        {day}
      </div>
    </button>
  );
}

export default function WeekView({ days, itemsByDate, onEditTask, onCompleteTask, onDropTask, onDayClick, onUpdateTask }) {
  const [dragOverDate, setDragOverDate] = useState(null);
  const scrollRef = useRef(null);

  const handleAllDayDragOver = (e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };
  const handleAllDayDrop = (e, date) => {
    e.preventDefault();
    setDragOverDate(null);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask(taskId, date, null);
  };

  // One shared scroll for the whole week: open at 7am, or earlier if
  // something this week starts earlier. Re-runs when the week changes.
  const weekKey = days[0]?.date;
  useEffect(() => {
    if (!scrollRef.current) return;
    let earliest = 7 * 60;
    for (const { date } of days) {
      for (const b of splitItems(itemsByDate[date] || []).timeBlocks) {
        const m = timeToMinutes(b.scheduled_time);
        if (m !== null && m < earliest) earliest = m;
      }
    }
    const targetMins = Math.max(HOUR_START * 60, earliest - 30);
    scrollRef.current.scrollTop = ((targetMins - HOUR_START * 60) / 60) * COMPACT_HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  const totalHours = HOUR_END - HOUR_START;

  return (
    <>
      {/* Desktop: one card, shared hour gutter, one scroll for all seven days */}
      <div className="hidden md:block rounded-2xl glass p-2">
        <div
          className="grid"
          style={{ gridTemplateColumns: COLUMNS, overflowY: 'hidden', scrollbarGutter: 'stable' }}
        >
          <div />
          {days.map(({ date, day, dayName, isToday }) => {
            const { allDayItems } = splitItems(itemsByDate[date] || []);
            const isDragOver = dragOverDate === date;
            return (
              <div key={date} className="min-w-0 px-0.5">
                <DayHeader dayName={dayName} day={day} isToday={isToday} onClick={() => onDayClick?.(date)} />
                {/* All-day section (drop target for date-only) */}
                <div
                  onDragOver={(e) => handleAllDayDragOver(e, date)}
                  onDragLeave={() => setDragOverDate(null)}
                  onDrop={(e) => handleAllDayDrop(e, date)}
                  className="rounded-md p-1 mb-1 min-h-[24px] transition-colors space-y-0.5"
                  style={{
                    background: isDragOver ? 'rgba(167,139,250,0.06)' : undefined,
                    boxShadow: isDragOver ? 'inset 0 0 0 1px rgba(167,139,250,0.5)' : undefined,
                  }}
                >
                  {allDayItems.map(item => (
                    <ItemCard key={item.id} item={item} onEditTask={onEditTask} onCompleteTask={onCompleteTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: `${SCROLL_HEIGHT}px`, scrollbarGutter: 'stable' }}
        >
          <div className="grid" style={{ gridTemplateColumns: COLUMNS }}>
            <div className="relative" style={{ height: `${totalHours * COMPACT_HOUR_HEIGHT}px` }}>
              {Array.from({ length: totalHours + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute right-0 font-mono text-[9.5px] text-text-3 -mt-1.5 pr-2 select-none"
                  style={{ top: `${i * COMPACT_HOUR_HEIGHT}px` }}
                >
                  {formatTimeLabel((HOUR_START + i) * 60)}
                </div>
              ))}
            </div>
            {days.map(({ date, isToday }) => (
              <div
                key={date}
                className="min-w-0"
                style={{
                  borderLeft: '1px solid rgba(255,255,255,0.05)',
                  background: isToday ? 'rgb(var(--violet) / 0.05)' : undefined,
                }}
              >
                <TimeGrid
                  date={date}
                  timeBlocks={splitItems(itemsByDate[date] || []).timeBlocks}
                  onDropTask={onDropTask}
                  onEditTask={onEditTask}
                  onCompleteTask={onCompleteTask}
                  onUpdateTask={onUpdateTask}
                  compact
                  bare
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: stacked day cards listing everything, timed items included */}
      <div className="md:hidden grid grid-cols-1 gap-2">
        {days.map(({ date, day, dayName, isToday }) => {
          const items = itemsByDate[date] || [];
          return (
            <div
              key={date}
              className="rounded-2xl glass p-2"
              style={{
                boxShadow: isToday
                  ? '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 0 0 1.5px rgb(var(--violet))'
                  : undefined,
              }}
            >
              <DayHeader dayName={dayName} day={day} isToday={isToday} onClick={() => onDayClick?.(date)} />
              <div className="space-y-0.5">
                {items.map(item => (
                  <ItemCard key={item.id} item={item} onEditTask={onEditTask} onCompleteTask={onCompleteTask} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
