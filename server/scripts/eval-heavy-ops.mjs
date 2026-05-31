// Head-to-head eval for the "heavy" AI ops (everything beyond Smart Capture).
// Forces each model via __setForceRoute and runs the real exported functions on
// fixtures, checking JSON-schema validity (Llama's known weak spot), ground-truth
// accuracy where the answer is objective, and latency. Gate for Phase 2 flips.
//
//   node scripts/eval-heavy-ops.mjs
import '../src/env.js';
import {
  __setForceRoute, processInbox, importNotes, findDuplicates,
  analyzeTask, suggestProjectBreakdown, getDailyPriorities, weeklyReviewAnalysis,
} from '../src/services/ai.js';

const CONTEXTS = [{ name: 'Personal' }, { name: 'Work' }, { name: 'Family' }, { name: 'Errands' }, { name: 'Health' }];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isArr = (x) => Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;

// Each test: run the fn, return { schemaValid, truth: {pass,total} | null }.
const TESTS = {
  'process-inbox': async () => {
    const tasks = [
      { id: 1, title: 'waiting for Mike to approve the budget' },
      { id: 2, title: 'buy groceries' },
      { id: 3, title: 'maybe someday learn French' },
      { id: 4, title: 'call the plumber about the leak' },
    ];
    const expect = { 1: 'waiting_for', 2: 'next_actions', 3: 'someday_maybe', 4: 'next_actions' };
    const r = await processInbox(tasks, CONTEXTS);
    const schemaValid = !!r && isArr(r.processed_items) && r.processed_items.every(i => i.original_index != null && isStr(i.recommended_list));
    let truth = null;
    if (schemaValid) {
      let pass = 0, total = 0;
      for (const item of r.processed_items) {
        const id = tasks[item.original_index - 1]?.id ?? item.original_index;
        if (expect[id]) { total++; if (item.recommended_list === expect[id]) pass++; }
      }
      truth = { pass, total };
    }
    return { schemaValid, truth };
  },
  'import-notes': async () => {
    const text = 'Email the landlord about the lease\nMaybe take a pottery class someday\nWaiting for the bank to confirm the wire';
    const r = await importNotes(text, CONTEXTS, [], '2026-06-01', 'Monday');
    const schemaValid = !!r && isArr(r.items) && r.items.length >= 2 && r.items.every(i => isStr(i.title) && isStr(i.recommended_list));
    let truth = null;
    if (schemaValid) {
      // expected lists by keyword match (order-independent)
      const lists = r.items.map(i => i.recommended_list);
      let pass = 0;
      if (lists.includes('someday_maybe')) pass++;
      if (lists.includes('waiting_for')) pass++;
      if (lists.includes('next_actions') || lists.includes('inbox')) pass++;
      truth = { pass, total: 3 };
    }
    return { schemaValid, truth };
  },
  'find-duplicates': async () => {
    const tasks = [
      { id: 1, title: 'Email John about the Q3 report', list: 'next_actions' },
      { id: 2, title: 'Send John the Q3 report by email', list: 'next_actions' },
      { id: 3, title: 'Buy milk', list: 'next_actions' },
    ];
    const r = await findDuplicates(tasks, CONTEXTS);
    const schemaValid = !!r && isArr(r.duplicate_groups);
    let truth = null;
    if (schemaValid) {
      const flat = r.duplicate_groups.flatMap(g => (g.tasks || []).map(t => t.id));
      let pass = 0;
      if (flat.includes(1) && flat.includes(2)) pass++; // found the real dup
      if (!flat.includes(3)) pass++;                     // no false positive
      truth = { pass, total: 2 };
    }
    return { schemaValid, truth };
  },
  'analyze-task': async () => {
    const r = await analyzeTask({ title: 'plan the company offsite for 40 people' }, CONTEXTS);
    const schemaValid = !!r && isStr(r.recommended_list) && typeof r.is_actionable === 'boolean' && typeof r.is_project === 'boolean';
    return { schemaValid, truth: null };
  },
  'project-breakdown': async () => {
    const r = await suggestProjectBreakdown({ name: 'Launch my personal website', outcome: 'Website live at my domain' }, CONTEXTS);
    const schemaValid = !!r && isArr(r.next_actions) && r.next_actions.length >= 2 && r.next_actions.every(a => isStr(a.title));
    return { schemaValid, truth: null };
  },
  'daily-priorities': async () => {
    const tasks = [
      { title: 'Finish the Q3 deck', context: 'Work', energy_level: 'high', time_estimate: 90 },
      { title: 'Reply to investor email', context: 'Work', energy_level: 'low', time_estimate: 15 },
      { title: 'Book dentist', context: 'Health', energy_level: 'low', time_estimate: 10 },
    ];
    const r = await getDailyPriorities(tasks, { inbox: 3, completed_today: 1 }, CONTEXTS);
    const schemaValid = !!r && isArr(r.suggested_focus) && isStr(r.productivity_tip);
    return { schemaValid, truth: null };
  },
  'weekly-review': async () => {
    const iso = '2026-05-20T00:00:00Z';
    const data = {
      stats: { inbox: 4, next_actions: 12, waiting_for: 3, someday_maybe: 8 },
      nextActions: [{ id: 1, title: 'Write launch post', context: 'Work', created_at: iso }],
      waitingFor: [{ id: 2, title: 'Contract', waiting_for_person: 'Mike', created_at: iso }],
      somedayMaybe: [{ id: 3, title: 'Learn guitar' }],
      projects: [{ name: 'Launch', status: 'active', task_count: 5, execution_mode: 'parallel', next_action: null }],
      staleItems: [{ id: 4, title: 'Old idea', list: 'someday_maybe', updated_at: iso }],
      habitStats: { habits: [{ name: 'Exercise', completionRate: 70, streak: 3 }] },
      completedThisWeek: 9,
      lastReviewDate: null,
    };
    const r = await weeklyReviewAnalysis(data, CONTEXTS);
    const schemaValid = !!r && isStr(r.weekly_summary) && isArr(r.recommendations) && typeof r.system_health_score === 'number';
    return { schemaValid, truth: null };
  },
};

const MODELS = [
  { label: 'gpt-4o (baseline)', route: { provider: 'openai', model: 'gpt-4o' } },
  { label: 'llama-3.3-70b (groq)', route: { provider: 'groq', model: 'llama-3.3-70b-versatile' } },
];

console.log('Eval: heavy ops — schema validity + ground-truth + latency\n');
for (const m of MODELS) {
  __setForceRoute(m.route);
  console.log(`### ${m.label}`);
  for (const [name, fn] of Object.entries(TESTS)) {
    const t0 = Date.now();
    let res, err = null;
    try { res = await fn(); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    if (err) { console.log(`  ${name.padEnd(18)} ERROR ${err.message}`); }
    else {
      const t = res.truth ? ` truth=${res.truth.pass}/${res.truth.total}` : '';
      console.log(`  ${name.padEnd(18)} schema=${res.schemaValid ? 'OK ' : 'BAD'}${t}  ${ms}ms`);
    }
    await sleep(6000); // stay under Groq free-tier 30k TPM
  }
  console.log('');
}
__setForceRoute(null);
