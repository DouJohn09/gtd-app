// Head-to-head eval for the Smart Capture prompt across models.
// Runs a fixed set of known-good captures through each model and scores the
// fields that drive real behavior (list, recurrence, confidence, context, dates,
// scheduling). Use this to gate any model swap — we only flip Smart Capture's
// primary provider if the candidate matches the gpt-4o-mini baseline.
//
//   node scripts/eval-smart-capture.mjs
//
// Requires OPENAI_API_KEY and GROQ_API_KEY in server/.env.
import '../src/env.js';
import OpenAI from 'openai';
import { buildSmartCaptureMessages } from '../src/services/ai.js';
import { validateSmartCaptureTasks } from '../src/services/aiSchema.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });

// The smart-capture chain's OpenAI models (services/aiRouter.js LIGHT).
// Groq's gpt-oss-20b is last in that chain and failed 12/49 here (2026-09-21);
// add { label: 'gpt-oss-20b (groq)', client: groq, model: 'openai/gpt-oss-20b' } to re-check it.
const MODELS = [
  { label: 'gpt-4o-mini (primary)',  client: openai, model: 'gpt-4o-mini' },
  { label: 'gpt-4.1-mini (fallback)', client: openai, model: 'gpt-4.1-mini' },
];
void groq;

// Fixed "today" so date assertions are deterministic. 2026-06-01 is a Monday.
const TODAY = '2026-06-01';
const dayName = new Date(TODAY + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const d = (n) => { const x = new Date(TODAY + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]; };

const CONTEXTS = [{ name: 'Personal' }, { name: 'Work' }, { name: 'Family' }, { name: 'Errands' }, { name: 'Computer' }, { name: 'Phone' }, { name: 'Health' }];
const PROJECTS = [{ name: 'Website Redesign', status: 'active' }, { name: 'Q3 Budget', status: 'active' }];

// expect keys are optional; only present ones are checked.
//   recurrence: 'none' | 'any' | '<rule>'   due: 'null' | 'YYYY-MM-DD'
//   confidence/context: array of acceptable values   someday/find_free_slot: bool
const CASES = [
  // --- date math ---
  { input: 'buy milk friday', expect: { list: 'next_actions', due: d(4), confidence: ['high'], recurrence: 'none' } },
  { input: 'call dentist tomorrow', expect: { list: 'next_actions', due: d(1), recurrence: 'none' } },
  { input: 'submit expense report in 3 days', expect: { due: d(3), recurrence: 'none' } },
  { input: 'team offsite next Monday', expect: { due: d(7) } },
  // --- recurrence TRUE positives ---
  { input: 'standup every weekday at 9am', expect: { recurrence: 'weekdays' } },
  { input: 'water the plants every 3 days', expect: { recurrence: 'any' } },
  { input: 'pay rent on the 1st of every month', expect: { recurrence: 'monthly' } },
  { input: 'gym every monday and thursday', expect: { recurrence: 'any' } },
  // --- recurrence FALSE-positive guards (must NOT set recurrence) ---
  { input: 'call mom tomorrow', expect: { recurrence: 'none', context: ['Personal', 'Family'] } },
  { input: 'finish the quarterly report', expect: { recurrence: 'none' } },
  { input: 'book flights for the conference', expect: { recurrence: 'none' } },
  { input: 'reply to the daily digest email from Stripe', expect: { recurrence: 'none' } },
  // --- confidence: bare noun phrases must be low ---
  { input: 'birthday gift', expect: { confidence: ['low'] } },
  { input: 'tax stuff', expect: { confidence: ['low'] } },
  { input: 'groceries', expect: { confidence: ['low'] } },
  { input: 'follow up', expect: { confidence: ['low'] } },
  // --- life-domain context preference ---
  { input: 'email Sarah about the Q3 budget', expect: { context: ['Work'], waiting_for_person: 'null' } },
  { input: 'pick up dry cleaning', expect: { context: ['Errands', 'Personal'] } },
  // --- list routing ---
  { input: 'maybe learn to play guitar someday', expect: { list: 'someday_maybe' } },
  // --- waiting_for TRUE positives (genuine delegation/blocking) ---
  { input: 'waiting for John to send the signed contract', expect: { list: 'waiting_for', waiting_for_person: 'John' } },
  { input: 'waiting on Priya to approve the budget', expect: { list: 'waiting_for', waiting_for_person: 'Priya' } },
  { input: 'need Mark to send me the API keys before I can deploy', expect: { list: 'waiting_for', waiting_for_person: 'Mark' } },
  { input: 'delegated the slides to Tom', expect: { list: 'waiting_for', waiting_for_person: 'Tom' } },
  // --- waiting_for FALSE-positive guards (attribution/mention is NOT delegation) ---
  { input: 'update the deck from Christian', expect: { list: 'next_actions', waiting_for_person: 'null' } },
  { input: 'task from the standup: refactor the auth module', expect: { waiting_for_person: 'null' } },
  { input: 'Sarah said the staging API is down, look into it', expect: { waiting_for_person: 'null' } },
  // --- scheduling intent ---
  { input: 'find me 30 minutes tomorrow to review the deck', expect: { find_free_slot: true, due: d(1) } },
  { input: 'lunch with Alex at noon tomorrow', expect: { scheduled_time: '12:00', due: d(1) } },
  // --- priority direction (5 = most important; a wrong-direction model fails these) ---
  { input: 'URGENT: renew car insurance today before it lapses', expect: { priority_min: 4, due: d(0) } },
  { input: 'maybe alphabetize my spice rack one day', expect: { list: 'someday_maybe', priority_max: 3 } },
  // --- duplicate detection against existing open tasks ---
  { input: 'renew the car insurance', existingTitles: ['Renew car insurance before it lapses', 'Draft Q3 planning doc'], expect: { dup: 'insurance' } },
  { input: 'wash the car this weekend', existingTitles: ['Renew car insurance before it lapses', 'Draft Q3 planning doc'], expect: { dup: 'null' } },
];
// Every case above must come back as exactly ONE task; each is checked for that too.

// Splitting: one capture naming several separate actions → several tasks, each
// classified on its own words. `tasks` entries are matched by a title keyword.
const SPLIT_CASES = [
  { input: "Call the dentist today… Anna's sending the budget on Friday… and I need to finish the Q4 deck for work.", count: 3, tasks: [
    { match: 'dentist', due: d(0) },
    { match: 'budget', list: 'waiting_for', waiting_for_person: 'Anna', due: d(4) },
    { match: 'deck', due: 'null', context: ['Work'] },
  ] },
  { input: 'pick up the dry cleaning, then book flights for the conference, oh and renew the car insurance by Friday', count: 3, tasks: [
    { match: 'clean', due: 'null' },
    { match: 'flight', due: 'null' },
    { match: 'insurance', due: d(4) },
  ] },
  { input: 'book a table for Saturday and remind Tom about the slides', count: 2, tasks: [
    { match: 'table', due: d(5) },
    { match: 'tom', due: 'null' },
  ] },
  { input: '1. fix the login bug\n2. write the release notes\n3. ping design about the icons', count: 3 },
  { input: 'water the plants every 3 days and call grandma on Sunday', count: 2, tasks: [
    { match: 'plant', recurrence: 'any' },
    { match: 'grandma', due: d(6), recurrence: 'none' },
  ] },
  // must stay ONE task
  { input: 'buy milk, eggs and bread', count: 1 },
  { input: 'email Sarah and ask whether the Q3 forecast assumes the new pricing', count: 1 },
  { input: 'call the bank to dispute the charge', count: 1 },
  { input: 'go to the store and buy batteries', count: 1 },
  { input: 'finish the report and send it to Mark', count: 1 },
];

function check(expect, ai) {
  const out = [];
  const ctxLc = (ai.context || '').toString().toLowerCase();
  if (expect.list !== undefined) out.push({ f: 'list', ok: ai.list === expect.list, got: ai.list, want: expect.list });
  if (expect.confidence) out.push({ f: 'confidence', ok: expect.confidence.includes(ai.list_confidence), got: ai.list_confidence, want: expect.confidence.join('|') });
  if (expect.context) out.push({ f: 'context', ok: expect.context.some(c => c.toLowerCase() === ctxLc), got: ai.context, want: expect.context.join('|') });
  if (expect.due !== undefined) {
    const ok = expect.due === 'null' ? !ai.due_date : ai.due_date === expect.due;
    out.push({ f: 'due', ok, got: ai.due_date, want: expect.due });
  }
  if (expect.recurrence !== undefined) {
    const r = ai.recurrence_rule;
    let ok;
    if (expect.recurrence === 'none') ok = !r;
    else if (expect.recurrence === 'any') ok = !!r;
    else ok = r === expect.recurrence;
    out.push({ f: 'recurrence', ok, got: r, want: expect.recurrence });
  }
  if (expect.find_free_slot !== undefined) out.push({ f: 'free_slot', ok: !!ai.find_free_slot === expect.find_free_slot, got: ai.find_free_slot, want: expect.find_free_slot });
  if (expect.scheduled_time !== undefined) out.push({ f: 'sched_time', ok: ai.scheduled_time === expect.scheduled_time, got: ai.scheduled_time, want: expect.scheduled_time });
  if (expect.priority_min !== undefined) out.push({ f: 'priority>=', ok: typeof ai.priority === 'number' && ai.priority >= expect.priority_min, got: ai.priority, want: `>=${expect.priority_min}` });
  if (expect.priority_max !== undefined) out.push({ f: 'priority<=', ok: ai.priority == null || ai.priority <= expect.priority_max, got: ai.priority, want: `<=${expect.priority_max}` });
  if (expect.dup !== undefined) {
    const got = (ai.possible_duplicate_of || '').toLowerCase();
    const ok = expect.dup === 'null' ? !got : got.includes(expect.dup.toLowerCase());
    out.push({ f: 'dup', ok, got: ai.possible_duplicate_of, want: expect.dup });
  }
  if (expect.waiting_for_person !== undefined) {
    const got = (ai.waiting_for_person || '').toLowerCase();
    const ok = expect.waiting_for_person === 'null' ? !got : got.includes(expect.waiting_for_person.toLowerCase());
    out.push({ f: 'waiting_for', ok, got: ai.waiting_for_person, want: expect.waiting_for_person });
  }
  return out;
}

async function runModel({ label, client, model }) {
  let pass = 0, total = 0, parseFails = 0;
  const latencies = [];
  const failures = [];
  for (const c of CASES) {
    const messages = buildSmartCaptureMessages(c.input, CONTEXTS, PROJECTS, TODAY, dayName, [], c.existingTitles || []);
    let ai = null;
    const t0 = Date.now();
    try {
      const res = await client.chat.completions.create({ model, messages, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 2500 });
      latencies.push(Date.now() - t0);
      ai = JSON.parse(res.choices[0].message.content);
      const problems = validateSmartCaptureTasks(ai);
      if (problems.length) throw new Error(problems.join('; '));
    } catch (e) {
      parseFails++;
      failures.push(`  ✗ "${c.input}" → ERROR/parse-fail: ${e.message}`);
      total += check(c.expect, {}).length; // count expected checks as failed
      continue;
    }
    const checks = [{ f: 'count', ok: ai.tasks.length === 1, got: ai.tasks.length, want: 1 }, ...check(c.expect, ai.tasks[0])];
    for (const ch of checks) {
      total++;
      if (ch.ok) pass++;
      else failures.push(`  ✗ "${c.input}" [${ch.f}] got=${JSON.stringify(ch.got)} want=${ch.want}`);
    }
  }
  for (const c of SPLIT_CASES) {
    const messages = buildSmartCaptureMessages(c.input, CONTEXTS, PROJECTS, TODAY, dayName, [], []);
    let ai;
    try {
      const t0 = Date.now();
      const res = await client.chat.completions.create({ model, messages, response_format: { type: 'json_object' }, temperature: 0, max_tokens: 2500 });
      latencies.push(Date.now() - t0);
      ai = JSON.parse(res.choices[0].message.content);
      const problems = validateSmartCaptureTasks(ai);
      if (problems.length) throw new Error(problems.join('; '));
    } catch (e) {
      parseFails++;
      total += 1 + (c.tasks || []).length;
      failures.push(`  ✗ "${c.input}" → ERROR/parse-fail: ${e.message}`);
      continue;
    }
    const titles = ai.tasks.map(t => t.title);
    const checks = [{ f: 'count', ok: ai.tasks.length === c.count, got: titles, want: c.count }];
    for (const want of c.tasks || []) {
      const { match, ...expect } = want;
      const task = ai.tasks.find(t => t.title.toLowerCase().includes(match));
      if (!task) { checks.push({ f: `find "${match}"`, ok: false, got: titles, want: match }); continue; }
      checks.push(...check(expect, task).map(ch => ({ ...ch, f: `${match}.${ch.f}` })));
    }
    for (const ch of checks) {
      total++;
      if (ch.ok) pass++;
      else failures.push(`  ✗ "${c.input.slice(0, 60)}" [${ch.f}] got=${JSON.stringify(ch.got)} want=${ch.want}`);
    }
  }
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return { label, pass, total, parseFails, avg, failures };
}

console.log(`Eval: Smart Capture — ${CASES.length} single + ${SPLIT_CASES.length} split cases, today=${TODAY} (${dayName})\n`);
for (const m of MODELS) {
  const r = await runModel(m);
  console.log(`### ${r.label}`);
  console.log(`   score: ${r.pass}/${r.total} field checks (${Math.round((r.pass / r.total) * 100)}%)  |  avg latency: ${r.avg}ms  |  parse failures: ${r.parseFails}`);
  if (r.failures.length) console.log(r.failures.join('\n'));
  console.log('');
}
