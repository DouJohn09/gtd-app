import { useEffect, useState } from 'react';
import { BarChart3, Clock, CalendarDays, Target, Lock, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import MonoLabel from '../components/ui/MonoLabel';
import { useUpgrade } from '../components/UpgradeModal';

/**
 * Insights: what your own history says about when you finish things, when
 * your habits stick, and how planned days compare with reality. Everything is
 * computed server-side from timestamps you already produce — no AI, nothing
 * to configure. Free sees the first card; the rest is the Pro "analytics".
 */

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

function Card({ icon: Icon, label, title, children, locked, onUnlock, tone = 'violet' }) {
  return (
    <section className="rounded-2xl glass p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color: `rgb(var(--${tone}-glow))` }} />
        <MonoLabel tone={tone}>{label}</MonoLabel>
      </div>
      <h2 className="font-display text-[22px] leading-tight mb-3">{title}</h2>
      <div className={locked ? 'pointer-events-none select-none' : ''} style={locked ? { filter: 'blur(6px)', opacity: 0.45 } : undefined} aria-hidden={locked || undefined}>
        {children}
      </div>
      {locked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: 'linear-gradient(180deg, rgba(21,21,30,0.1), rgba(21,21,30,0.55))' }}>
          <Lock className="w-4 h-4 text-text-3" />
          <p className="text-[13px] text-text-2 max-w-xs">Pro shows the full picture of your week, your habits, and how your planned days really go.</p>
          <button onClick={onUnlock} className="font-mono text-[11px] uppercase tracking-wider px-4 py-2 rounded-xl text-white" style={{ background: 'rgb(var(--violet-deep, var(--violet)))' }}>
            See Pro
          </button>
        </div>
      )}
    </section>
  );
}

function Sentence({ text, fallback }) {
  return (
    <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: text ? 'rgb(var(--text-1, 245 245 247))' : undefined }}>
      {text || <span className="text-text-3">{fallback}</span>}
    </p>
  );
}

// 24 thin bars. `peak` highlights a [start,end) window.
function HourStrip({ values, peak, tone = 'violet', height = 56 }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {values.map((v, h) => {
          const inPeak = peak && h >= peak.start && h < peak.end;
          return (
            <div key={h} className="flex-1 rounded-t-[3px] transition-all" title={`${pad(h)}:00 · ${v}`}
              style={{
                height: `${Math.max(3, (v / max) * 100)}%`,
                background: inPeak ? `rgb(var(--${tone}-glow))` : `rgb(var(--${tone}) / ${v ? 0.45 : 0.12})`,
              }} />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[9.5px] text-text-3 mt-1.5">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

function WeekBars({ values, tone = 'mint' }) {
  const max = Math.max(1, ...values);
  // Monday-first for reading; data is Sunday-indexed.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="grid grid-cols-7 gap-2 items-end" style={{ height: 88 }}>
      {order.map((d) => (
        <div key={d} className="flex flex-col items-center justify-end h-full gap-1.5">
          <span className="font-mono text-[10px] text-text-3">{values[d]}</span>
          <div className="w-full rounded-t-md" title={`${WD[d]} · ${values[d]}`}
            style={{ height: `${Math.max(4, (values[d] / max) * 100)}%`, background: `rgb(var(--${tone}) / ${values[d] === max ? 0.9 : 0.4})` }} />
          <span className="font-mono text-[10px] text-text-3">{WD[d]}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className="font-display text-[26px] leading-none">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-3 mt-1.5">{label}</div>
      {sub && <div className="text-[11.5px] text-text-3 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { showUpgrade } = useUpgrade();
  const unlock = () => showUpgrade({ resource: 'insights' });

  useEffect(() => {
    api.insights.get().then(setData).catch((e) => setError(e.message || 'Could not load insights'));
  }, []);

  const hours = data?.hours;
  const week = data?.week;
  const habits = data?.habits;
  const reality = data?.reality;

  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1400px]">
      <div className="mb-10 fresh-stagger">
        <MonoLabel className="mb-3">patterns · last 8 weeks</MonoLabel>
        <h1 className="font-display text-[52px] md:text-[60px] leading-[1] tracking-tight">Insights</h1>
        <p className="mt-4 text-[15px] max-w-xl text-text-2">
          What your own history says. Nothing to set up — it reads the timestamps you already leave behind and
          gets more honest the longer you use Cleartable.
        </p>
      </div>

      {error && <p className="text-[13px] text-text-3 mb-6">{error}</p>}
      {!data && !error && <p className="text-[13px] text-text-3">Reading your history…</p>}

      {data && (
        <div className="grid gap-5 md:grid-cols-2 max-w-5xl">
          <Card icon={Clock} label="productive hours" title="When you finish things">
            <Sentence text={hours.hoursSentence} fallback={`Finish ${Math.max(0, hours.minimum - hours.total)} more tasks and this fills in. (${hours.total} so far.)`} />
            <HourStrip values={hours.byHour} peak={hours.peak} />
            <p className="text-[11.5px] text-text-3 mt-3">Counts the moment you tick a task off, in your timezone. Batch-ticking at night shows up here too.</p>
          </Card>

          <Card icon={CalendarDays} label="your week" title="Which days carry the load" locked={week?.locked} onUnlock={unlock} tone="mint">
            {week?.locked ? (
              <WeekBars values={[3, 8, 11, 7, 9, 5, 2]} />
            ) : (
              <>
                <Sentence text={week.sentence} fallback={`Needs about ${week.minimum ?? 20} completions to say anything useful.`} />
                <WeekBars values={week.byWeekday} />
              </>
            )}
          </Card>

          <Card icon={Target} label="habits" title="When your habits stick" locked={habits?.locked} onUnlock={unlock} tone="amber">
            {habits?.locked ? (
              <div className="space-y-4">
                {['Morning pages', 'Workout', 'Read'].map((n) => (
                  <div key={n}><div className="text-[13px] mb-1.5">{n}</div><HourStrip values={Array.from({ length: 24 }, (_, h) => (h > 6 && h < 10 ? 8 : 1))} tone="amber" height={28} /></div>
                ))}
              </div>
            ) : habits.habits.length === 0 ? (
              <Sentence fallback="No active habits yet. Add one and its rhythm shows up here." />
            ) : (
              <div className="space-y-4">
                <p className="text-[11.5px] text-text-3 -mt-1">Times are when you checked the habit off, so backfilled days land at the moment you logged them.</p>
                {habits.habits.map((h) => (
                  <div key={h.id}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <div className="text-[13.5px] truncate">{h.name}</div>
                      <div className="font-mono text-[10.5px] text-text-3 flex-shrink-0">
                        {h.done} done{h.rate != null ? ` · ${Math.round(h.rate * 100)}%` : ''}{h.skipped ? ` · ${h.skipped} rest` : ''}
                      </div>
                    </div>
                    <HourStrip values={h.byHour} peak={h.peak} tone="amber" height={28} />
                    <p className="text-[12px] mt-1.5" style={{ color: h.sentence ? undefined : 'rgb(var(--text-3, 120 120 130))' }}>
                      {h.sentence || `Log it ${Math.max(0, habits.minimum - h.done)} more times to see its rhythm.`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card icon={BarChart3} label="plan vs reality" title="How your planned days go" locked={reality?.locked} onUnlock={unlock}>
            {reality?.locked ? (
              <div className="grid grid-cols-3 gap-2"><Stat label="planned" value="48" /><Stat label="finished" value="31" /><Stat label="per day" value="2.6" /></div>
            ) : reality.level === 'none' ? (
              <>
                <Sentence fallback={reality.days === 0
                  ? 'Plan a day with the AI and apply it. After five planned days this card shows what you really finish, and the planner starts sizing your days to it.'
                  : `${reality.days} planned day${reality.days === 1 ? '' : 's'} recorded. ${Math.max(0, reality.minimum - reality.days)} more and this fills in.`} />
                <div className="flex items-center gap-2 text-[12px] text-text-3"><Sparkles className="w-3.5 h-3.5" /> The planner learns from every applied day.</div>
              </>
            ) : (
              <>
                <Sentence text={reality.sentence} />
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <Stat label="planned" value={reality.planned} sub={`${reality.days} days`} />
                  <Stat label="finished" value={reality.done} sub={`${Math.round(reality.completionRate * 100)}%`} />
                  <Stat label="a day" value={reality.avgDone.toFixed(1)} sub={`planner now caps at ${reality.suggestedBlocks}`} />
                </div>
                <MonoLabel className="mb-1.5">finish rate by block start</MonoLabel>
                <HourStrip values={reality.byHour.map(b => (b.planned >= 3 ? Math.round(b.rate * 100) : 0))} peak={reality.bestHour ? { start: reality.bestHour.hour, end: reality.bestHour.hour + 1 } : null} />
                <p className="text-[11.5px] text-text-3 mt-3">
                  {reality.moved} moved to another day · {reality.released} let go · {reality.open} never closed out
                </p>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
