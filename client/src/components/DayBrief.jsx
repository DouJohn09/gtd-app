import { useState } from 'react';
import { CalendarClock, X, Check } from 'lucide-react';

const fmtMins = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/**
 * The morning brief — the deterministic half of the planning ritual, shown
 * once per day on first open. No AI call: just the shape of the day (free
 * time left, meetings, candidates) with the "Plan my day" CTA; once a plan
 * is applied it turns into a quiet progress line. Dismiss hides it until
 * tomorrow (per device, localStorage). The brief itself is fetched once by
 * the Dashboard and shared with the evening shutdown card.
 */
export default function DayBrief({ brief, onPlan, planning, hidden }) {
  const [dismissedDate, setDismissedDate] = useState(() => localStorage.getItem('ct_brief_dismissed'));

  if (hidden || !brief || dismissedDate === brief.date) return null;

  const dismiss = () => {
    localStorage.setItem('ct_brief_dismissed', brief.date);
    setDismissedDate(brief.date);
  };

  // Progress state: a plan is applied — show how the day is going.
  if (brief.plan?.applied && brief.plan.total > 0) {
    const { done, total } = brief.plan;
    const allDone = done >= total;
    return (
      <div className="rounded-2xl glass px-4 py-3 mb-5 flex items-center gap-3" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>
        <span
          className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0"
          style={{ background: 'rgb(var(--mint) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--mint) / 0.25)' }}
        >
          <Check className="w-3.5 h-3.5" style={{ color: 'rgb(var(--mint-glow))' }} />
        </span>
        <p className="text-[13px] text-text-2 flex-1">
          {allDone
            ? <>Today&rsquo;s plan is <span className="text-mint-glow font-medium">done</span> — anything else can wait for tomorrow.</>
            : <><span className="font-mono text-text-1">{done}/{total}</span> planned blocks done{done > 0 ? ' — on track.' : ' — the first one is the hardest.'}</>}
        </p>
        <button onClick={dismiss} aria-label="Dismiss brief" className="grid place-items-center w-6 h-6 rounded-md text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // CTA state: nothing planned yet and there's a day worth planning.
  if (!brief.plan && brief.candidates > 0 && brief.freeMins >= 30) {
    return (
      <div className="rounded-2xl glass px-4 py-3 mb-5 flex items-center gap-3 flex-wrap" style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.18)' }}>
        <span
          className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0"
          style={{ background: 'rgb(var(--violet) / 0.10)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.25)' }}
        >
          <CalendarClock className="w-3.5 h-3.5" style={{ color: 'rgb(var(--violet-glow))' }} />
        </span>
        <p className="text-[13px] text-text-2 flex-1 min-w-[12rem]">
          <span className="text-text-1 font-medium">{fmtMins(brief.freeMins)} free</span>
          {brief.meetings > 0
            ? <> between {brief.meetings} meeting{brief.meetings === 1 ? '' : 's'}</>
            : <> and a clear calendar</>}
          {' · '}{brief.candidates} candidate{brief.candidates === 1 ? '' : 's'} for today
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPlan}
            disabled={planning}
            className="gtd-btn gtd-btn-primary !py-1.5 text-[12px] inline-flex items-center gap-1.5 disabled:opacity-70"
          >
            {planning && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Plan my day
          </button>
          <button onClick={dismiss} aria-label="Dismiss brief" className="grid place-items-center w-6 h-6 rounded-md text-text-3 hover:text-text-1 hover:bg-white/5 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
