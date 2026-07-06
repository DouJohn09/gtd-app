// Eval for the plan-day op. planDay() is pure (the route assembles the day),
// so fixtures drive it directly. Because packPlan reconciles deterministically
// AFTER the model, the hard guarantees (no busy-overlap, fits capacity) should
// hold on EVERY model — what varies is judgment quality: does it defer on
// overload, respect due-today, leave breathing room, write real reasons.
//
//   node scripts/eval-plan-day.mjs                       # default: groq + gpt-4.1-mini
//   node scripts/eval-plan-day.mjs groq:llama-3.3-70b-versatile
import '../src/env.js';
import { __setForceRoute, planDay } from '../src/services/ai.js';
import { timeToMinutes } from '../src/services/scheduling.js';

const CONTEXTS = [{ name: '@work' }, { name: '@home' }, { name: '@personal' }];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const T = (title, extra = {}) => ({ title, context: '@work', energy_level: 'medium', time_estimate: 30, ...extra });
const WEEKDAY = { today: '2026-07-08', dayName: 'Wednesday', workStart: 540, workEnd: 1080 }; // Wed 9-18
const WEEKEND = { today: '2026-07-11', dayName: 'Saturday', workStart: 600, workEnd: 960 };  // Sat 10-16

// Each fixture: { name, tasks, day, expect(result, ctx) → problem strings }
const FIXTURES = [
  {
    name: 'normal-day',
    tasks: [
      T('Finish the quarterly report', { due_date: '2026-07-08', priority: 4, energy_level: 'high', time_estimate: 90 }),
      T('Reply to Anna about the offsite', { time_estimate: 15 }),
      T('Book dentist appointment', { context: '@personal', time_estimate: 15 }),
      T('Review pull requests', { time_estimate: 45 }),
      T('Water the plants', { context: '@home', energy_level: 'low', time_estimate: 10 }),
    ],
    day: { ...WEEKDAY, meetings: [{ title: 'Team sync', start: 600, end: 660 }], freeRanges: [{ start: 540, end: 600 }, { start: 660, end: 840 }, { start: 930, end: 1080 }], totalFreeMins: 390, habits: [{ name: 'Exercise', completed_today: false }] },
    expect: (r) => {
      const p = [];
      if (!r.plan.length) p.push('empty plan on a plannable day');
      if (!r.plan.some(b => b.task_index === 1)) p.push('due-today task not planned');
      return p;
    },
  },
  {
    name: 'overload-must-defer',
    tasks: [
      T('Deep work: architecture doc', { due_date: '2026-07-08', energy_level: 'high', time_estimate: 180 }),
      T('Prepare board slides', { due_date: '2026-07-08', priority: 5, time_estimate: 120 }),
      T('Write launch email', { time_estimate: 90 }),
      T('Fix the login bug', { due_date: '2026-07-07', time_estimate: 120 }),
      T('Interview prep', { time_estimate: 60 }),
      T('Expense report', { energy_level: 'low', time_estimate: 45 }),
    ],
    // Only 3h free — ~10h of work. MUST defer.
    day: { ...WEEKDAY, meetings: [{ title: 'All-hands', start: 540, end: 720 }, { title: 'Client workshop', start: 780, end: 990 }], freeRanges: [{ start: 720, end: 780 }, { start: 990, end: 1080 }], totalFreeMins: 150, habits: [] },
    expect: (r) => {
      const p = [];
      if (!r.deferred.length) p.push('overloaded day produced no deferrals');
      if (!r.overloaded) p.push('overloaded flag not set');
      return p;
    },
  },
  {
    name: 'empty-calendar',
    tasks: [
      T('Draft the proposal', { energy_level: 'high', time_estimate: 120 }),
      T('Call the bank', { time_estimate: 15 }),
      T('Tidy the desk', { energy_level: 'low', time_estimate: 20 }),
    ],
    day: { ...WEEKDAY, meetings: [], freeRanges: [{ start: 540, end: 1080 }], totalFreeMins: 540, habits: [] },
    expect: (r) => (r.plan.length ? [] : ['empty plan with a fully free day']),
  },
  {
    name: 'weekend-light',
    tasks: [
      T('Plan the garden beds', { context: '@home', time_estimate: 60 }),
      T('File taxes', { context: '@personal', due_date: '2026-07-20', time_estimate: 120 }),
      T('Read contract draft', { time_estimate: 60 }),
    ],
    day: { ...WEEKEND, meetings: [{ title: 'Kids football', start: 660, end: 780 }], freeRanges: [{ start: 600, end: 660 }, { start: 780, end: 960 }], totalFreeMins: 240, habits: [{ name: 'Long walk', completed_today: false }] },
    expect: () => [],
  },
  {
    name: 'deferred-start-excluded',
    tasks: [
      T('Prepare tax documents', { start_date: '2026-07-15', time_estimate: 60 }),
      T('Send invoice', { due_date: '2026-07-08', time_estimate: 15 }),
    ],
    day: { ...WEEKDAY, meetings: [], freeRanges: [{ start: 540, end: 1080 }], totalFreeMins: 540, habits: [] },
    expect: (r) => (r.plan.some(b => b.task_index === 1) ? ['planned a task whose start_date is in the future'] : []),
  },
  {
    name: 'no-estimates',
    tasks: [
      T('Untangle the billing question', { time_estimate: null }),
      T('Sketch onboarding flow', { time_estimate: null, energy_level: null }),
    ],
    day: { ...WEEKDAY, meetings: [], freeRanges: [{ start: 540, end: 1080 }], totalFreeMins: 540, habits: [] },
    expect: (r) => (r.plan.every(b => b.duration_mins >= 15) ? [] : ['made up a sub-15-minute duration']),
  },
];

// Hard invariants — must hold on every model because packPlan enforces them.
function invariantProblems(r, day) {
  const p = [];
  const blocks = r.plan.map(b => ({ s: timeToMinutes(b.start), e: timeToMinutes(b.start) + b.duration_mins }));
  for (const b of blocks) {
    const inFree = day.freeRanges.some(fr => fr.start <= b.s && b.e <= fr.end);
    if (!inFree) p.push(`block ${b.s}-${b.e} outside free ranges`);
  }
  const sorted = [...blocks].sort((a, b) => a.s - b.s);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s < sorted[i - 1].e) p.push('blocks overlap each other');
  }
  const totalPlanned = blocks.reduce((sum, b) => sum + (b.e - b.s), 0);
  if (totalPlanned > day.totalFreeMins) p.push(`planned ${totalPlanned}m > ${day.totalFreeMins}m free`);
  for (const b of r.plan) if (!b.reason?.trim()) p.push('block missing reason');
  if (typeof r.summary !== 'string' || !r.summary.trim()) p.push('missing summary');
  return p;
}

const args = process.argv.slice(2);
const MODELS = (args.length ? args : ['groq:llama-3.3-70b-versatile', 'openai:gpt-4.1-mini']).map(spec => {
  const [provider, ...rest] = spec.split(':');
  return { label: spec, route: { provider, model: rest.join(':') } };
});

console.log('Eval: plan-day — hard invariants + judgment quality\n');
for (const m of MODELS) {
  __setForceRoute(m.route);
  console.log(`### ${m.label}`);
  let pass = 0;
  for (const f of FIXTURES) {
    const t0 = Date.now();
    let r, err = null;
    try { r = await planDay(f.tasks, f.day, CONTEXTS); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    if (err || !r || r.error) {
      console.log(`  ${f.name.padEnd(26)} ERROR ${err?.message || r?.error || 'null result'}`);
    } else {
      const problems = [...invariantProblems(r, f.day), ...f.expect(r)];
      if (!problems.length) pass++;
      console.log(`  ${f.name.padEnd(26)} ${problems.length ? 'FAIL' : 'PASS'}  plan=${r.plan.length} deferred=${r.deferred.length}${r.overloaded ? ' overloaded' : ''}  ${ms}ms${problems.length ? '\n    - ' + problems.join('\n    - ') : ''}`);
    }
    await sleep(6000); // Groq free-tier TPM headroom
  }
  console.log(`  → ${pass}/${FIXTURES.length} pass\n`);
}
__setForceRoute(null);
