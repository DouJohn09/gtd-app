import { Link } from 'react-router-dom';
import {
  Command, ListChecks, Star, CalendarClock, CalendarRange, RotateCcw, Target,
  ListTodo, FolderKanban, Clock, CloudSun, List, Sparkles, BarChart3, Smartphone, ArrowRight,
} from 'lucide-react';
import MonoLabel from '../components/ui/MonoLabel';

// "How to get the most out of Cleartable" — the long-form companion to the
// four-step first-run wizard, which stays short on purpose. Reachable from the
// sidebar (system) and the wizard's last step. Static copy, no data.

const FIRST_STEPS = [
  { text: 'Press ⌘K (or the capture button on your phone) and empty your head: five or ten things, unsorted.', to: null },
  { text: 'Open the Inbox and give each one a home: do it, date it, hand it off, or park it.', to: '/inbox', cta: 'Inbox' },
  { text: 'Connect Google Calendar so planning sees your meetings.', to: '/calendar', cta: 'Calendar' },
  { text: 'On Today, press “Plan my day” and see your tasks slotted between meetings.', to: '/', cta: 'Today' },
];

const RHYTHMS = [
  {
    icon: CalendarClock, tone: 'violet', label: 'every morning', title: 'Plan the day',
    text: 'Open Today and press “Plan my day”. It reads your meetings and free time, picks what fits and proposes a time for each task. Adjust anything, then apply. With Google Calendar connected, the blocks show up there too.',
    to: '/', cta: 'Go to Today',
  },
  {
    icon: Command, tone: 'amber', label: 'all day', title: 'Capture, then forget',
    text: 'Anything that pops up goes in with ⌘K, the way you’d say it: “call the dentist tomorrow”. With AI on, the date, context and project are filled in for you.',
    to: null,
  },
  {
    icon: CalendarRange, tone: 'mint', label: 'once a week', title: 'Review and plan the week',
    text: 'Ten minutes in Review & Planning: clear the Inbox, check what you’re waiting for, then “Plan my week”. Each task gets a day and a slot between your meetings. You see it all in the calendar before anything is booked.',
    to: '/review', cta: 'Review & Planning',
  },
];

const PLACES = [
  { icon: ListTodo, name: 'Next Actions', text: 'Everything ready to do. Filter by context (@home, @work, @phone) to see only what fits where you are.', to: '/lists/next_actions' },
  { icon: FolderKanban, name: 'Projects', text: 'Anything that takes more than one step. Keep one clear next action per project and it never stalls.', to: '/projects' },
  { icon: Clock, name: 'Waiting For', text: 'Things you’ve handed off. Note who has it, and the weekly review reminds you to chase.', to: '/lists/waiting_for' },
  { icon: CloudSun, name: 'Someday/Maybe', text: 'Ideas you’re not committing to yet. Out of the way, but you’ll see them in every review.', to: '/lists/someday_maybe' },
  { icon: List, name: 'Your own lists', text: 'Books, films, gift ideas: the “+” next to Lists in the sidebar. Paste a link and AI fills in the details.', to: null },
  { icon: Star, name: 'Today', text: 'Star the few tasks that matter now. Today shows only those, plus what’s due and your habits.', to: '/' },
];

const MORE = [
  { icon: Target, name: 'Habits', text: 'Daily, weekly or every few days, with skip and rest days, so a missed day isn’t a broken streak.', to: '/habits' },
  { icon: BarChart3, name: 'Insights', text: 'When you get things done, which days carry the load, and how your plans compare with what happened.', to: '/insights' },
  { icon: Sparkles, name: 'How much AI', text: 'Off, Suggest, or Organize for me. Change it any time in Settings. With AI off, your task text never leaves the app.', to: '/settings' },
  { icon: Smartphone, name: 'On your phone', text: 'Open cleartable.app in your phone’s browser and add it to the home screen. It works like an app.', to: null },
];

function Tone({ tone, children }) {
  return (
    <div
      className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
      style={{ background: `rgb(var(--${tone}) / 0.10)`, boxShadow: `inset 0 0 0 1px rgb(var(--${tone}) / 0.25)` }}
    >
      {children}
    </div>
  );
}

function Go({ to, children }) {
  if (!to) return null;
  return (
    <Link to={to} className="tap-expand inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors">
      {children} <ArrowRight className="w-3 h-3" />
    </Link>
  );
}

export default function Guide() {
  return (
    <div className="px-6 lg:px-12 pt-10 pb-20 max-w-[1100px]">
      <div className="mb-10 fresh-stagger">
        <MonoLabel className="mb-3">guide · how to get the most out of it</MonoLabel>
        <h1 className="font-display text-[44px] md:text-[60px] leading-[1] tracking-tight">Make it yours</h1>
        <p className="mt-4 text-[15px] max-w-xl text-text-2">
          You don’t need all of this on day one. Start with the first four steps; come back when you want more.
        </p>
      </div>

      <section className="mb-12">
        <MonoLabel tone="violet" className="mb-3">start here · about 10 minutes</MonoLabel>
        <ol className="grid gap-2 max-w-3xl">
          {FIRST_STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-3.5 rounded-xl p-3.5 glass">
              <span className="font-mono text-[11px] text-text-3 mt-0.5">0{i + 1}</span>
              <p className="text-[13.5px] text-text-2 leading-relaxed flex-1">{s.text}</p>
              <Go to={s.to}>{s.cta}</Go>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <MonoLabel className="mb-3">the rhythm</MonoLabel>
        <div className="grid gap-3 md:grid-cols-3">
          {RHYTHMS.map(r => (
            <div key={r.title} className="rounded-2xl glass p-5 flex flex-col">
              <Tone tone={r.tone}><r.icon className="w-4 h-4" style={{ color: `rgb(var(--${r.tone}-glow))` }} /></Tone>
              <MonoLabel className="mt-4">{r.label}</MonoLabel>
              <h2 className="font-display text-[22px] leading-tight mt-1">{r.title}</h2>
              <p className="text-[13px] text-text-3 leading-relaxed mt-2 flex-1">{r.text}</p>
              {r.to && <div className="mt-4"><Go to={r.to}>{r.cta}</Go></div>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <MonoLabel className="mb-3">where things live</MonoLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLACES.map(p => <Item key={p.name} {...p} />)}
        </div>
      </section>

      <section className="mb-12">
        <MonoLabel className="mb-3">when you want more</MonoLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {MORE.map(p => <Item key={p.name} {...p} />)}
        </div>
      </section>

      <section className="rounded-2xl glass p-5 max-w-3xl flex items-start gap-3.5">
        <Tone tone="amber"><RotateCcw className="w-4 h-4" style={{ color: 'rgb(var(--amber-glow))' }} /></Tone>
        <div>
          <h2 className="text-[14px] font-medium text-text-1">If it ever feels messy</h2>
          <p className="text-[13px] text-text-3 leading-relaxed mt-1">
            Do a weekly review. It’s the reset button: everything gets looked at once, and the week ahead is planned from a clean slate.
          </p>
        </div>
        <div className="ml-auto self-center flex-shrink-0"><Go to="/review">Review</Go></div>
      </section>

      <p className="mt-10 text-[12.5px] text-text-3 inline-flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" /> Questions or ideas? Write to <a className="text-text-2 hover:text-text-1 underline underline-offset-2" href="mailto:hello@cleartable.app">hello@cleartable.app</a>.
      </p>
    </div>
  );
}

function Item({ icon: Icon, name, text, to }) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-3" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px] font-medium text-text-1">{name}</span>
          <Go to={to}>open</Go>
        </div>
        <p className="text-[12.5px] text-text-3 leading-relaxed mt-1">{text}</p>
      </div>
    </div>
  );
}
