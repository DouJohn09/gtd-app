import { useState } from 'react';
import {
  LayoutDashboard, Inbox, FolderKanban, CalendarDays, ListTodo, Clock,
  CloudSun, Target, RotateCcw, Sparkles, Command, Zap, ListChecks, Star,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useAiMode } from '../hooks/useAiMode';
import { useToast } from './Toast';
import MonoLabel from './ui/MonoLabel';

// Full-screen first-run wizard, shown once per account (users.onboarded_at,
// server-side — unlike the old localStorage tour it doesn't reappear on a new
// device). Four steps: the core loop → the navigation map → the AI dial →
// optional sample data. Skipping counts as done; the mode dial and everything
// else stays reachable in Settings.

const LOOP_STEPS = [
  {
    icon: Command,
    tone: 'violet',
    title: 'Capture',
    text: 'Get every thought out of your head — press ⌘K anywhere and type. Errands, ideas, promises: it all lands in your Inbox.',
  },
  {
    icon: ListChecks,
    tone: 'amber',
    title: 'Clarify',
    text: 'Once a day, empty the Inbox. Each note becomes a next step: do it, schedule it, hand it off, or park it for someday.',
  },
  {
    icon: Star,
    tone: 'mint',
    title: 'Focus',
    text: 'Star what matters now. Today shows only that — a short list you can actually finish.',
  },
];

const NAV_GROUPS = [
  {
    label: 'workflow',
    items: [
      { icon: LayoutDashboard, name: 'Today',     text: 'Your day: starred tasks, habits, what’s due.' },
      { icon: Inbox,           name: 'Inbox',     text: 'Everything you capture waits here to be sorted.' },
      { icon: FolderKanban,    name: 'Projects',  text: 'Anything that takes more than one step.' },
      { icon: CalendarDays,    name: 'Calendar',  text: 'Drag tasks into real time slots.' },
    ],
  },
  {
    label: 'lists',
    items: [
      { icon: ListTodo, name: 'Next Actions',  text: 'Sorted tasks ready to do, filterable by context like @home.' },
      { icon: Clock,    name: 'Waiting For',   text: 'Handed off — track who owes you what.' },
      { icon: CloudSun, name: 'Someday/Maybe', text: 'Ideas parked for later, never lost.' },
    ],
  },
  {
    label: 'rituals',
    items: [
      { icon: Target,   name: 'Habits',        text: 'Small routines, tracked gently — no guilt streaks.' },
      { icon: RotateCcw, name: 'Weekly Review', text: 'Ten minutes a week to keep the system trusted.' },
      { icon: Sparkles, name: 'AI Assistant',  text: 'Bulk tools: process the Inbox, plan your day.' },
    ],
  },
];

const MODES = [
  {
    key: 'off',
    title: "I'll organize myself",
    desc: 'No AI. You capture, clarify and file everything by hand — your task text never leaves the app.',
  },
  {
    key: 'assisted',
    title: 'Suggest — I decide',
    badge: 'recommended',
    desc: 'AI pre-sorts new tasks and fills in the details; nothing moves until you confirm it.',
  },
  {
    key: 'auto',
    title: 'Organize for me',
    desc: 'Just type. Confident tasks file themselves — only unclear ones wait for you.',
  },
];

// Each sample seeds a different surface (Today, Inbox, a context, Waiting
// For, Someday) so the map the user just saw isn't a wall of empty pages.
const SAMPLE_TASKS = [
  { title: 'Open me — this is what a task holds', list: 'inbox', notes: 'Sample task — the Inbox is where everything you capture waits. Open a task to set a date, context or project; delete samples any time.' },
  { title: 'Reply to Alex about the weekend trip', list: 'next_actions', context: '@phone', is_daily_focus: true, notes: 'Sample task — it’s starred, so it shows up on Today.' },
  { title: 'Water the plants', list: 'next_actions', context: '@home', notes: 'Sample task — contexts like @home let you filter by where you are.' },
  { title: 'Refund from the airline', list: 'waiting_for', waiting_for_person: 'Airline support', notes: 'Sample task — Waiting For tracks things other people owe you.' },
  { title: 'Plan a weekend in the mountains', list: 'someday_maybe', notes: 'Sample task — Someday/Maybe keeps ideas around without cluttering your lists.' },
];

export default function WelcomeOnboarding() {
  const { patchUser } = useAuth();
  const { mode, setMode } = useAiMode();
  const { addToast } = useToast();
  const [step, setStep] = useState(0);
  const [modeChoice, setModeChoice] = useState(mode || 'assisted');
  const [seedSamples, setSeedSamples] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const last = step === 3;

  // Optimistic: hide the wizard immediately; if the server call fails it
  // simply shows again next load, same fail-open pattern as the AI nudges.
  const markDone = () => {
    patchUser({ onboarded_at: new Date().toISOString() });
    api.preferences.completeOnboarding().catch(() => {});
  };

  const saveMode = async () => {
    if (modeChoice === mode) return;
    try { await setMode(modeChoice); }
    catch { addToast('Could not save your choice — you can set it later in Settings.', 'info'); }
  };

  const finish = async () => {
    setFinishing(true);
    if (seedSamples) {
      const results = await Promise.allSettled(SAMPLE_TASKS.map(t => api.tasks.create(t)));
      if (results.some(r => r.status === 'fulfilled')) {
        window.dispatchEvent(new Event('task-captured'));
      }
    }
    markDone();
    if (!seedSamples) window.dispatchEvent(new Event('open-capture'));
  };

  const next = async () => {
    if (step === 2) await saveMode();
    if (last) { await finish(); return; }
    setStep(step + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,14,0.62)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl glass relative"
        style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgb(255 255 255 / 0.06)' }}
      >
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.16), transparent 70%)' }}
        />
        <div className="p-7 sm:p-8 relative">
          <div className="flex items-center justify-between mb-4">
            <MonoLabel tone="violet">{['welcome', 'the map', 'ai', 'ready'][step]} · {step + 1}/4</MonoLabel>
            <button
              onClick={markDone}
              className="font-mono text-[10.5px] uppercase tracking-wider text-text-3 hover:text-text-1 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
            >
              Skip intro
            </button>
          </div>

          {step === 0 && (
            <>
              <h2 className="font-display text-[28px] leading-tight">Welcome to Cleartable</h2>
              <p className="mt-2 text-[13.5px] text-text-2 max-w-md leading-relaxed">
                A clear head in three moves. Everything in the app hangs off this loop.
              </p>
              <div className="mt-5 grid gap-2.5">
                {LOOP_STEPS.map((s, i) => (
                  <div
                    key={s.title}
                    className="flex items-start gap-3.5 rounded-xl p-3.5"
                    style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl grid place-items-center flex-shrink-0"
                      style={{ background: `rgb(var(--${s.tone}) / 0.10)`, boxShadow: `inset 0 0 0 1px rgb(var(--${s.tone}) / 0.25)` }}
                    >
                      <s.icon className="w-4 h-4" style={{ color: `rgb(var(--${s.tone}-glow))` }} />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-medium text-text-1">
                        <span className="font-mono text-[10.5px] text-text-3 mr-2">0{i + 1}</span>{s.title}
                      </div>
                      <p className="text-[12.5px] text-text-3 mt-1 leading-relaxed">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-[28px] leading-tight">Find your way around</h2>
              <p className="mt-2 text-[13.5px] text-text-2 max-w-md leading-relaxed">
                The sidebar mirrors the loop — capture up top, lists in the middle, rituals below.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {NAV_GROUPS.map(group => (
                  <div key={group.label} className={group.label === 'workflow' ? 'sm:row-span-2' : ''}>
                    <MonoLabel className="mb-2">{group.label}</MonoLabel>
                    <div className="grid gap-1.5">
                      {group.items.map(item => (
                        <div key={item.name} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                          <item.icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-3" />
                          <div>
                            <span className="text-[12.5px] font-medium text-text-1">{item.name}</span>
                            <p className="text-[11.5px] text-text-3 leading-snug mt-0.5">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-[28px] leading-tight">How much should AI help?</h2>
              <p className="mt-2 text-[13.5px] text-text-2 max-w-md leading-relaxed">
                One dial, changeable any time in Settings. Nothing you organize is ever touched without you.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {MODES.map(m => {
                  const selected = modeChoice === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setModeChoice(m.key)}
                      className="text-left rounded-xl p-3.5 transition-all hover:bg-white/[0.04]"
                      style={
                        selected
                          ? { background: 'rgb(var(--violet) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.35)' }
                          : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }
                      }
                    >
                      <div className="text-[13.5px] font-medium text-text-1">{m.title}</div>
                      {m.badge && (
                        <div className="font-mono text-[9.5px] uppercase tracking-wider mt-0.5" style={{ color: 'rgb(var(--violet-glow))' }}>
                          {m.badge}
                        </div>
                      )}
                      <p className="text-[12px] text-text-3 mt-1.5 leading-relaxed">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-[28px] leading-tight">You're all set</h2>
              <p className="mt-2 text-[13.5px] text-text-2 max-w-md leading-relaxed">
                Contexts like <span className="text-text-1">@home</span> and <span className="text-text-1">@work</span> are
                ready, and <span className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-text-1">⌘K</span> captures
                from anywhere. Start with your own thoughts, or look around with a few samples first.
              </p>
              <label
                className="mt-5 flex items-start gap-3 rounded-xl p-3.5 cursor-pointer transition-all hover:bg-white/[0.04]"
                style={
                  seedSamples
                    ? { background: 'rgb(var(--violet) / 0.08)', boxShadow: 'inset 0 0 0 1px rgb(var(--violet) / 0.35)' }
                    : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }
                }
              >
                <input
                  type="checkbox"
                  checked={seedSamples}
                  onChange={e => setSeedSamples(e.target.checked)}
                  className="mt-0.5 accent-violet-400"
                />
                <div>
                  <div className="text-[13px] font-medium text-text-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" style={{ color: 'rgb(var(--amber-glow))' }} />
                    Add a few sample tasks
                  </div>
                  <p className="text-[12px] text-text-3 mt-1 leading-relaxed">
                    Five tasks spread across Today, Inbox and the lists so you can poke around. Delete them any time.
                  </p>
                </div>
              </label>
            </>
          )}

          <div className="mt-6 flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="gtd-btn gtd-btn-secondary text-[12.5px]">
                Back
              </button>
            )}
            <button
              onClick={next}
              disabled={finishing}
              className="gtd-btn gtd-btn-primary inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
            >
              {last
                ? (finishing ? 'Setting up…' : seedSamples ? 'Add samples & start' : <><Command className="w-3.5 h-3.5" /> Start capturing</>)
                : 'Next'}
            </button>
            <div className="ml-auto flex gap-1.5">
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-colors"
                  style={{ background: i === step ? 'rgb(var(--violet-glow))' : 'rgba(255,255,255,0.12)' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
