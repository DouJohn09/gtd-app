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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });

const MODELS = [
  { label: 'gpt-4o-mini (baseline)', client: openai, model: 'gpt-4o-mini' },
  { label: 'llama-3.3-70b (groq)',   client: groq,   model: 'llama-3.3-70b-versatile' },
];

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
    const messages = buildSmartCaptureMessages(c.input, CONTEXTS, PROJECTS, TODAY, dayName, []);
    let ai = null;
    const t0 = Date.now();
    try {
      const res = await client.chat.completions.create({ model, messages, response_format: { type: 'json_object' } });
      latencies.push(Date.now() - t0);
      ai = JSON.parse(res.choices[0].message.content);
    } catch (e) {
      parseFails++;
      failures.push(`  ✗ "${c.input}" → ERROR/parse-fail: ${e.message}`);
      total += check(c.expect, {}).length; // count expected checks as failed
      continue;
    }
    const checks = check(c.expect, ai);
    for (const ch of checks) {
      total++;
      if (ch.ok) pass++;
      else failures.push(`  ✗ "${c.input}" [${ch.f}] got=${JSON.stringify(ch.got)} want=${ch.want}`);
    }
  }
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return { label, pass, total, parseFails, avg, failures };
}

console.log(`Eval: Smart Capture — ${CASES.length} cases, today=${TODAY} (${dayName})\n`);
for (const m of MODELS) {
  const r = await runModel(m);
  console.log(`### ${r.label}`);
  console.log(`   score: ${r.pass}/${r.total} field checks (${Math.round((r.pass / r.total) * 100)}%)  |  avg latency: ${r.avg}ms  |  parse failures: ${r.parseFails}`);
  if (r.failures.length) console.log(r.failures.join('\n'));
  console.log('');
}
