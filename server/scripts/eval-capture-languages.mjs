// Smart Capture in other languages: Czech, French, German, Ukrainian, Hindi
// (plus Hinglish and an English control). Checks the fields that drive real
// behavior (dates, list, repeat, splitting) and that titles stay in the
// language the user wrote, never translated to English.
//
//   node scripts/eval-capture-languages.mjs [model]     default gpt-4.1-mini
//
// Requires OPENAI_API_KEY in server/.env. Sends only the fixed test sentences below.
import '../src/env.js';
import OpenAI from 'openai';
import { buildSmartCaptureMessages } from '../src/services/ai.js';
import { validateSmartCaptureTasks } from '../src/services/aiSchema.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.argv[2] || 'gpt-4.1-mini';

// Fixed "today" so dates are deterministic. 2026-06-01 is a Monday.
const TODAY = '2026-06-01';
const dayName = 'Monday';
const d = (n) => { const x = new Date(TODAY + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]; };
const CONTEXTS = [{ name: '@home' }, { name: '@work' }, { name: '@errands' }, { name: '@computer' }, { name: '@phone' }];
const PROJECTS = [{ name: 'Website Redesign', status: 'active' }];

const CYRILLIC = /[Ѐ-ӿ]/;
const DEVANAGARI = /[ऀ-ॿ]/;

// keep: the title must match this (proves it was not translated).
const CASES = [
  { lang: 'en', input: 'call the dentist tomorrow', expect: { due: d(1), list: 'next_actions' }, keep: /dentist/i },
  { lang: 'cs', input: 'zavolat zubaři zítra', expect: { due: d(1), list: 'next_actions' }, keep: /zub/i },
  { lang: 'cs', input: 'koupit mléko v pátek', expect: { due: d(4) }, keep: /mlék/i },
  { lang: 'cs', input: 'příští pondělí poslat Anně rozpočet', expect: { due: d(7) }, keep: /rozpo/i },
  { lang: 'cs', input: 'každé pondělí a čtvrtek posilovna', expect: { recurrence: 'any' }, keep: /posil/i },
  { lang: 'cs', input: 'možná se jednou naučit malovat', expect: { list: 'someday_maybe' }, keep: /malov/i },
  { lang: 'cs', input: 'čekám na Petra, až pošle smlouvu', expect: { list: 'waiting_for' }, keep: /smlouv/i },
  { lang: 'cs', input: 'zavolat mámě zítra a v pátek koupit dárek pro Evu', count: 2, keep: /mám|dár/i },
  { lang: 'fr', input: 'appeler le dentiste demain', expect: { due: d(1) }, keep: /dentist/i },
  { lang: 'fr', input: 'acheter du lait vendredi', expect: { due: d(4) }, keep: /lait/i },
  { lang: 'fr', input: 'payer le loyer le 1er de chaque mois', expect: { recurrence: 'monthly' }, keep: /loyer/i },
  { lang: 'de', input: 'morgen den Zahnarzt anrufen', expect: { due: d(1) }, keep: /zahnarzt/i },
  { lang: 'de', input: 'nächsten Montag den Bericht an Anna schicken', expect: { due: d(7) }, keep: /bericht/i },
  { lang: 'de', input: 'irgendwann mal Gitarre lernen', expect: { list: 'someday_maybe' }, keep: /gitarre/i },
  { lang: 'uk', input: 'зателефонувати стоматологу завтра', expect: { due: d(1) }, keep: CYRILLIC },
  { lang: 'uk', input: 'купити молоко в пʼятницю', expect: { due: d(4) }, keep: CYRILLIC },
  { lang: 'hi', input: 'कल डेंटिस्ट को फोन करना है', expect: { due: d(1) }, keep: DEVANAGARI },
  { lang: 'hi', input: 'शुक्रवार को दूध खरीदना', expect: { due: d(4) }, keep: DEVANAGARI },
  { lang: 'hi', input: 'हर सोमवार जिम जाना', expect: { recurrence: 'any' }, keep: DEVANAGARI },
  // Held out: none of these resemble the prompt's own examples.
  { lang: 'cs', input: 'napsat Tomovi kvůli schůzce', expect: { list: 'next_actions' }, keep: /schůz|Tom/i },
  { lang: 'de', input: 'Milch kaufen', keep: /milch/i },
  { lang: 'fr', input: 'peut-être apprendre le piano un jour', expect: { list: 'someday_maybe' }, keep: /piano/i },
  { lang: 'uk', input: 'чекаю, поки Олег надішле рахунок', expect: { list: 'waiting_for' }, keep: CYRILLIC },
  { lang: 'hi', input: 'बैंक जाकर पासबुक अपडेट करवाना', keep: DEVANAGARI },
  { lang: 'hi-en', input: 'kal dentist ko call karna hai', expect: { due: d(1) }, keep: /dentist/i },
];

async function run(c) {
  const messages = buildSmartCaptureMessages(c.input, CONTEXTS, PROJECTS, TODAY, dayName, [], []);
  const res = await openai.chat.completions.create({ model: MODEL, messages, temperature: 0, max_tokens: 2500, response_format: { type: 'json_object' } });
  const parsed = JSON.parse(res.choices[0].message.content);
  const problems = validateSmartCaptureTasks(parsed);
  const tasks = parsed.tasks || [];
  const fails = [];
  if (problems.length) fails.push(`schema: ${problems[0]}`);
  const want = c.count || 1;
  if (tasks.length !== want) fails.push(`tasks ${tasks.length}≠${want}`);
  const t = tasks[0] || {};
  const e = c.expect || {};
  if (e.due && t.due_date !== e.due) fails.push(`due ${t.due_date}≠${e.due}`);
  if (e.list && t.list !== e.list) fails.push(`list ${t.list}≠${e.list}`);
  if (e.recurrence === 'any' && !t.recurrence_rule) fails.push('no repeat');
  if (e.recurrence && e.recurrence !== 'any' && t.recurrence_rule !== e.recurrence) fails.push(`repeat ${t.recurrence_rule}≠${e.recurrence}`);
  if (!tasks.every(x => c.keep.test(x.title || '')) && !tasks.some(x => c.keep.test(x.title || ''))) fails.push('title translated');
  return { lang: c.lang, input: c.input, titles: tasks.map(x => x.title).join(' | '), reasoning: (tasks[0]?.reasoning || '').slice(0, 60), ok: !fails.length, fails: fails.join('; ') };
}

const results = [];
for (const c of CASES) results.push(await run(c).catch(err => ({ lang: c.lang, input: c.input, ok: false, fails: err.message })));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.lang}] ${r.input}\n      → ${r.titles}${r.fails ? `\n      ✗ ${r.fails}` : ''}\n      reasoning: ${r.reasoning}`);
const passed = results.filter(r => r.ok).length;
console.log(`\n${MODEL}: ${passed}/${results.length} passed`);
