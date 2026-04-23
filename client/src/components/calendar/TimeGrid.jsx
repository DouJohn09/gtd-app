import { useState, useRef, useEffect } from 'react';

const HOUR_START = 0;
const HOUR_END = 24;
const HOUR_HEIGHT = 56;
const SNAP_MINUTES = 15;

function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${h12}${ampm}`;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function snapMinutes(mins) {
  return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
}

export default function TimeGrid({
  date,
  timeBlocks,
  onDropTask,
  onEditTask,
  onCompleteTask,
  onUpdateTask,
  compact = false,
}) {
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const [dragOverY, setDragOverY] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [movingId, setMovingId] = useState(null);

  const hourHeight = compact ? 40 : HOUR_HEIGHT;
  const totalHours = HOUR_END - HOUR_START;
  const scrollHeight = compact ? 420 : 560;

  // Scroll to 7am on mount (or earliest scheduled block, whichever is sooner)
  useEffect(() => {
    if (!scrollRef.current) return;
    const earliest = timeBlocks.reduce((min, b) => {
      const m = timeToMinutes(b.scheduled_time);
      return m !== null && m < min ? m : min;
    }, 7 * 60);
    const targetMins = Math.max(HOUR_START * 60, earliest - 30);
    scrollRef.current.scrollTop = ((targetMins - HOUR_START * 60) / 60) * hourHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yToMinutes = (y) => {
    const minsFromStart = (y / hourHeight) * 60;
    return HOUR_START * 60 + snapMinutes(minsFromStart);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDragOverY(e.clientY - rect.top);
  };
  const handleDragLeave = () => setDragOverY(null);
  const handleDrop = (e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const mins = Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - 30, yToMinutes(y)));
    const time = minutesToTime(mins);
    const taskId = parseInt(e.dataTransfer.getData('text/plain'));
    if (taskId) onDropTask?.(taskId, date, time);
    setDragOverY(null);
  };

  // Resize via mouse
  useEffect(() => {
    if (!resizingId) return;
    const handleMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = e.clientY - rect.top;
      const block = timeBlocks.find(b => b.id === resizingId);
      if (!block) return;
      const startMins = timeToMinutes(block.scheduled_time);
      const endMins = Math.max(startMins + 15, yToMinutes(y));
      const newDuration = Math.min(endMins - startMins, HOUR_END * 60 - startMins);
      onUpdateTask?.(resizingId, { duration: newDuration });
    };
    const handleUp = () => setResizingId(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizingId, timeBlocks, hourHeight]);

  return (
    <div
      ref={scrollRef}
      className="relative overflow-y-auto"
      style={{ maxHeight: `${scrollHeight}px` }}
    >
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative"
        style={{ height: `${totalHours * hourHeight}px` }}
      >
        {/* Hour gridlines + labels */}
        {Array.from({ length: totalHours + 1 }).map((_, i) => {
          const hour = HOUR_START + i;
          const top = i * hourHeight;
          return (
            <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top: `${top}px` }}>
              <div
                className="font-mono text-[9.5px] text-text-3 w-10 -mt-1.5 text-right pr-2 select-none"
                style={{ flexShrink: 0 }}
              >
                {formatTimeLabel(hour * 60)}
              </div>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          );
        })}

        {/* Half-hour gridlines (lighter) */}
        {Array.from({ length: totalHours }).map((_, i) => {
          const top = i * hourHeight + hourHeight / 2;
          return (
            <div
              key={`half-${i}`}
              className="absolute left-10 right-0 h-px pointer-events-none"
              style={{ top: `${top}px`, background: 'rgba(255,255,255,0.02)' }}
            />
          );
        })}

        {/* Drop indicator */}
        {dragOverY !== null && (
          <div
            className="absolute left-10 right-1 pointer-events-none rounded-md"
            style={{
              top: `${Math.max(0, ((snapMinutes((dragOverY / hourHeight) * 60)) / 60) * hourHeight)}px`,
              height: `${hourHeight}px`,
              background: 'rgba(167,139,250,0.10)',
              boxShadow: 'inset 0 0 0 1.5px rgba(167,139,250,0.5)',
            }}
          />
        )}

        {/* Time blocks */}
        <div className="absolute left-10 right-1 top-0 bottom-0 pointer-events-none">
          {timeBlocks.map(task => {
            const startMins = timeToMinutes(task.scheduled_time);
            if (startMins === null) return null;
            const duration = task.duration || 60;
            const top = ((startMins - HOUR_START * 60) / 60) * hourHeight;
            const height = Math.max(20, (duration / 60) * hourHeight - 2);
            const isCompleted = task.list === 'completed';

            return (
              <TimeBlock
                key={task.id}
                task={task}
                top={top}
                height={height}
                compact={compact}
                onEdit={onEditTask}
                onComplete={onCompleteTask}
                onResizeStart={() => setResizingId(task.id)}
                isCompleted={isCompleted}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeBlock({ task, top, height, compact, onEdit, onComplete, onResizeStart, isCompleted }) {
  const tone = task.list === 'inbox' ? 'amber' :
               task.list === 'waiting_for' ? 'rose' :
               task.list === 'someday_maybe' ? 'violet' : 'mint';

  return (
    <div
      draggable={!isCompleted}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id.toString());
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onEdit?.(task)}
      className="absolute left-0 right-0 rounded-lg cursor-pointer transition-all overflow-hidden pointer-events-auto group"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        background: `rgb(var(--${tone}) / 0.12)`,
        boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.30), inset 3px 0 0 rgb(var(--${tone}-glow))`,
        opacity: isCompleted ? 0.5 : 1,
      }}
    >
      <div className={`flex items-start gap-1.5 ${compact ? 'p-1' : 'p-1.5'} h-full`}>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete?.(task.id); }}
          className="grid place-items-center w-3 h-3 rounded-full border shrink-0 mt-0.5"
          style={{ borderColor: `rgb(var(--${tone}-glow))`, opacity: 0.7 }}
          aria-label="Complete"
        />
        <div className="flex-1 min-w-0">
          <div
            className={`${compact ? 'text-[10px]' : 'text-[11.5px]'} font-medium leading-tight truncate ${isCompleted ? 'line-through' : ''}`}
            style={{ color: `rgb(var(--${tone}-glow))` }}
          >
            {task.title}
          </div>
          {!compact && height > 32 && (
            <div className="font-mono text-[9px] text-text-3 mt-0.5">
              {formatTimeLabel(timeToMinutes(task.scheduled_time))}
              {task.duration ? ` · ${task.duration}m` : ''}
            </div>
          )}
        </div>
      </div>
      {!isCompleted && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(); }}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `rgb(var(--${tone}) / 0.4)` }}
        />
      )}
    </div>
  );
}
