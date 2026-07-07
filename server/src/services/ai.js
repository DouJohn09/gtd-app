import OpenAI from 'openai';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import {
  validateSmartCapture, validateProcessInbox, validateImportNotes,
  validateDailyPriorities, validateFindDuplicates, validateWeeklyReview,
  validateAnalyzeTask, validateProjectBreakdown, validatePlanDay,
} from './aiSchema.js';
import { packPlan, timeToMinutes, minutesToTime } from './scheduling.js';

// Provider clients. OpenAI is the paid/reliable baseline; Groq is the fast,
// free, privacy-safe (Groq does not train on API data) provider for the
// high-frequency, latency-sensitive calls. Either may be absent — routing
// below degrades gracefully when a key isn't configured.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// maxRetries: 0 + timeout: 15s — we have our OWN fallback (to OpenAI in
// `complete`), so a Groq rate-limit (429), blip, or throttle-STALL should drop
// straight to the fallback rather than burn seconds on SDK backoff or hang on
// the SDK's 10-minute default timeout. (A free-tier TPM stall can otherwise hold
// the connection for minutes — observed in the heavy-ops eval.) 15s is a circuit
// breaker well above the ~1–2s happy path, not an expected wait.
const groq = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 0, timeout: 15000 })
  : null;

const PROVIDERS = { openai, groq };

// Per-task model routing. Each task tries `primary`; on ANY error OR a JSON
// parse failure it falls back to `fallback`. Fallback is always OpenAI, so the
// quality/reliability floor stays at gpt-4o(-mini) no matter how the free model
// behaves — JSON-schema adherence is Llama's one known weak spot, and this is
// the safety net for it. Flip a task's primary to Groq once its eval passes
// (see scripts/eval-*); the fallback keeps production safe meanwhile.
const GROQ = 'llama-3.3-70b-versatile';
const ROUTING = {
  // Migrated to Groq (eval-verified parity, see scripts/eval-smart-capture.mjs + eval-heavy-ops.mjs):
  'smart-capture':     { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o-mini' } },
  'process-inbox':     { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'import-notes':      { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'find-duplicates':   { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'url-extract':       { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o-mini' } },
  // Advisory ops (low-frequency, high-judgment). Flipped to Groq primary on
  // 2026-06-30 after OpenAI hit a billing/quota 429 that left all four dead
  // (fallback was null). Structural parity was proven in eval
  // (scripts/eval-heavy-ops.mjs). Fallback downgraded gpt-4o → gpt-4.1-mini
  // 2026-07-06: gpt-4o is legacy-priced (~6x the cost) and these ops only see
  // the fallback when Groq is down or throttled — eval-verified parity below.
  'daily-priorities':  { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'plan-day':          { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'analyze-task':      { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'project-breakdown': { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
  'weekly-review':     { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4.1-mini' } },
};

// Per-task sampling + output caps. Classification/extraction tasks run at
// temperature 0 — provider defaults (Groq: 1.0) made identical inputs classify
// differently between runs, which users read as "the AI is flaky". Advisory
// prose gets mild warmth. max_tokens is sized to each task's worst-case JSON so
// a runaway response is cut (and caught via finish_reason) instead of hanging
// or blowing the parse on a 100-item ramble.
const TASK_PARAMS = {
  'smart-capture':     { temperature: 0,   max_tokens: 1024 },
  'process-inbox':     { temperature: 0,   max_tokens: 4096 },
  'import-notes':      { temperature: 0,   max_tokens: 8192 },
  'find-duplicates':   { temperature: 0,   max_tokens: 2048 },
  'url-extract':       { temperature: 0 },
  'daily-priorities':  { temperature: 0.2, max_tokens: 1500 },
  'plan-day':          { temperature: 0.2, max_tokens: 2000 },
  'analyze-task':      { temperature: 0.2, max_tokens: 800 },
  'project-breakdown': { temperature: 0.4, max_tokens: 2048 },
  'weekly-review':     { temperature: 0.4, max_tokens: 3000 },
};

// Test-only: force every complete() call onto one {provider, model}, bypassing
// ROUTING, so scripts/eval-* can A/B models against the real functions. Never set
// in production code.
let _forceRoute = null;
export function __setForceRoute(r) { _forceRoute = r; }

// Unified chat completion with provider routing + automatic fallback. Returns
// parsed JSON, or null if every available provider fails (the caller then does
// its own fallback — e.g. Smart Capture saves the raw text). A JSON.parse failure
// or a truncated response (finish_reason=length) is treated as a provider
// failure and advances to the fallback provider.
//
// `validate` (optional) is a fn(parsed) → array of problem strings. On problems,
// ONE repair round-trip is made on the same provider (the model sees its own
// output plus the problem list); if the repair still fails validation, the next
// provider is tried. Keeps enum/typo-level slop out of the database without a
// heavyweight schema library.
async function complete(task, params, validate = null) {
  const route = ROUTING[task];
  const attempts = _forceRoute ? [_forceRoute] : [route?.primary, route?.fallback].filter(Boolean);
  const tuning = TASK_PARAMS[task] || {};
  let lastErr = null;
  for (const { provider, model } of attempts) {
    const client = PROVIDERS[provider];
    if (!client) continue;
    try {
      let messages = params.messages;
      for (let round = 0; round < 2; round++) {
        const res = await client.chat.completions.create({ ...tuning, ...params, messages, model });
        const choice = res.choices[0];
        if (choice.finish_reason === 'length') throw new Error('response truncated (finish_reason=length)');
        const parsed = JSON.parse(choice.message.content);
        const problems = validate ? validate(parsed) : [];
        if (!problems.length) return parsed;
        if (round === 1) throw new Error(`schema validation failed after repair: ${problems.slice(0, 5).join('; ')}`);
        console.warn(`AI[${task}] ${provider}/${model} schema problems, repairing: ${problems.slice(0, 5).join('; ')}`);
        messages = [
          ...params.messages,
          { role: 'assistant', content: choice.message.content },
          { role: 'user', content: `Your JSON response had these problems:\n- ${problems.join('\n- ')}\n\nReturn the FULL corrected JSON object only — same data, with these problems fixed.` },
        ];
      }
    } catch (err) {
      lastErr = err;
      console.error(`AI[${task}] ${provider}/${model} failed: ${err.message}`);
    }
  }
  if (lastErr) console.error(`AI[${task}] all providers exhausted.`);
  return null;
}

function getSystemPrompt(userContexts) {
  const contextList = userContexts?.length
    ? userContexts.map(c => c.name || c).join(', ')
    : '@home, @work, @errands, @computer, @phone, @anywhere';

  return `You are a GTD (Getting Things Done) productivity assistant based on David Allen's methodology.
Your role is to help users process, organize, and clarify their tasks and projects.

GTD Lists:
- inbox: Unprocessed items that need clarification
- next_actions: Clear, actionable tasks that can be done immediately (should start with a verb)
- waiting_for: Tasks delegated to others that you're tracking
- someday_maybe: Ideas and tasks for potential future action

Contexts (optional tags for next_actions):
${contextList}

When analyzing tasks:
1. Check if it's actionable - if not, it goes to someday_maybe or trash
2. If actionable, determine if it's a single action or a project (multi-step)
3. For projects, identify the next physical action
4. Consider energy level (low/medium/high) and time estimate in minutes
5. Identify if task is clear enough or needs clarification

Priority scale (whenever a "priority" field appears): integer 1-5 where 5 = most urgent/important and 1 = least. Higher numbers sort first in the app.

Any "reasoning" or "reason" field you write is shown to the user in the UI. Write it in plain, friendly language a person who has never heard of GTD understands — say "this is a clear single step you can act on" rather than "this is the next physical action".

Always respond in JSON format as specified in each request.`;
}

// ---- Shared prompt-building helpers (used by every classifier so all
// features see the user's world the same way) ----

export function formatContextOptions(userContexts) {
  return userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
}

// Few-shot block from the user's own past classifications so the AI learns
// their personal pattern (e.g. "call mom" → Personal, not Phone). Ordered by
// updated_at upstream, so corrections teach the next call.
export function formatHistoryBlock(history) {
  return history?.length
    ? `
USER'S RECENT CLASSIFICATIONS (mirror this pattern when ambiguous):
${history.map(h => `- "${h.title}" → context: ${h.context}${h.list ? `, list: ${h.list}` : ''}`).join('\n')}

Treat these as the strongest hints about how THIS user actually organizes tasks. If a new input is similar to one of these, copy the classification choice.
`
    : '';
}

export function buildSmartCaptureMessages(rawText, userContexts, projects, today, dayName, history = [], existingTitles = []) {
  const contextOptions = formatContextOptions(userContexts);
  const projectList = projects?.length
    ? projects.map(p => p.name).join(', ')
    : '';
  const historyBlock = formatHistoryBlock(history);
  const existingBlock = existingTitles?.length
    ? `
DUPLICATE CHECK — the user's current open tasks include:
${existingTitles.map(t => `- "${t}"`).join('\n')}
If this input describes the SAME action as one of these (not merely a related one), set possible_duplicate_of to that task's exact title and mention it in reasoning. Otherwise set it to null. Still parse and return the task either way.
`
    : '';
  return [
    { role: 'system', content: getSystemPrompt(userContexts) },
    {
      role: 'user',
      content: `You are a smart task capture assistant. Today is ${dayName}, ${today}.

Parse this raw input into a structured GTD task. Extract any dates, people, contexts, and classify it.

Raw input: "${rawText}"

DATE RULES (critical — get this right):
- Today is ${dayName}, ${today}
- "tomorrow" = the day after ${today}
- "Friday" or "by Friday" = the NEAREST upcoming Friday from ${today}. If today IS Friday, it means TODAY.
- "next Monday" = the Monday of NEXT week
- "in 3 days" = ${today} + 3 calendar days
- "end of month" = last day of the current month
- Always return dates as YYYY-MM-DD format
- If no date is mentioned, due_date should be null

ENERGY LEVEL RULES:
- low: quick/simple tasks — calls, emails, messages, lookups, reminders, errands
- medium: moderate focus — meetings, reviews, planning, writing short documents
- high: deep focus — coding, analysis, complex writing, strategic thinking, creative work

DAILY FOCUS RULES:
- is_daily_focus = true ONLY if the task is due TODAY or the input explicitly implies urgency ("urgent", "ASAP", "right now", "today")
- is_daily_focus = false for tasks due tomorrow or later, or with no urgency signals
- "tomorrow" does NOT mean daily focus — it's scheduled for tomorrow, not today

${historyBlock}${existingBlock}
CONTEXT RULES (critical — this is where most mistakes happen):
- Context must be one of the user's existing contexts (or null): ${contextOptions}.
- Do NOT invent context names. Only use names from the list above. If none fit, return null.

Two kinds of contexts exist:
  - LIFE-DOMAIN contexts describe whose life the task belongs to: Personal, Work, Family, Home, Side-Project, Health, etc.
  - ACTIVITY-TYPE contexts describe the tool, place, or activity: Phone, Computer, Office, Errands, Anywhere, etc.

Rule of preference: when a task could fit BOTH a life-domain context and an activity-type context, ALWAYS prefer the life-domain context.
  - "Call mom" → Personal (NOT Phone). The phone is incidental; this is about the personal relationship.
  - "Email Sarah about Q3 plan" → Work (NOT Computer). The computer is incidental; this is work.
  - "Buy birthday gift for sister" → Personal or Family (NOT Errands), if those exist.

Use activity-type contexts only when:
  (a) no life-domain context fits, OR
  (b) the user has NO life-domain contexts at all, OR
  (c) the activity/location is the dominant useful filter (e.g. "pick up dry cleaning" → Errands when no Personal/Family context exists).

Detect work vs personal from signals:
  - WORK: report, meeting, client, deadline, presentation, sprint, deploy, stakeholder, colleague names, professional verbs
  - PERSONAL/FAMILY: family members (mom, dad, kids, sister), groceries, doctor, gym, home repairs, hobbies, friends, school
But these signals choose WHICH life-domain context — they don't override the preference rule above.
${projectList ? `
PROJECT MATCHING:
- Active projects: ${projectList}
- If the task clearly relates to one of these projects, set project_name to the EXACT project name from the list above.
- Match based on keywords, topic relevance, or explicit mention of the project name.
- If no project matches, set project_name to null.
- Do NOT invent project names — only use names from the list above.
` : ''}
RECURRENCE RULES:
- Detect recurring patterns: "every day", "daily", "every Monday", "weekly", "every month", "every 2 weeks", "weekdays", etc.
- recurrence_rule: "daily", "weekly", "monthly", "yearly", "weekdays", or "custom"
- recurrence_interval: number (e.g., 2 for "every 2 weeks")
- recurrence_days: comma-separated day codes for custom rules: "mon,wed,fri"
- If no recurrence detected, all recurrence fields should be null
- When recurrence is detected, set due_date to the FIRST occurrence (e.g., "every Monday" → next Monday)

START DATE RULES:
- Detect "starting from", "from Monday", "beginning next week" → extract as start_date
- start_date is when the task becomes actionable (different from due_date which is the deadline)
- If not mentioned, start_date should be null

TIME-OF-DAY RULES (time blocking):
- Detect explicit times: "at 2pm", "at 14:00", "at 9:30am", "from 3 to 4pm"
- Detect rough times: "this morning" → 09:00, "this afternoon" → 14:00, "this evening" → 18:00, "tonight" → 19:00, "lunch" → 12:00
- scheduled_time format: "HH:MM" 24-hour (e.g., "14:00", "09:30")
- duration in minutes: extract from "for 30 minutes", "1 hour", "from 3 to 4pm" (= 60). Default 60 if scheduled_time set but duration not specified.
- If a scheduled_time is set, also set due_date to that day (today/tomorrow/etc.)
- If no time-of-day mentioned, scheduled_time and duration must be null

FREE-SLOT INTENT RULES (auto-scheduling):
- Detect intents like "find time tomorrow", "book me 30 minutes Friday", "schedule this for the afternoon", "fit it in my calendar this week"
- When detected: set find_free_slot=true, leave scheduled_time=null (the server will find an open slot and set it)
- Always set due_date to the target day (today/tomorrow/etc.). If "this week" with no day, use the next weekday.
- Always set duration (default 30 if user didn't specify). The slot search needs it.
- Do NOT set find_free_slot when an explicit time is given — that case is already handled by scheduled_time.

OTHER RULES:
- Title rule: preserve the user's intent. Produce a clear, complete action statement — NOT a 2–3 word keyword summary. Keep the verb, the object, and any meaningful qualifier ("in the URL", "for the bookmark", "before Friday", etc.). Aim for natural phrasing (typically 5–15 words). Strip ONLY parsed dates/times/recurrence patterns and obvious filler ("um", "like", "I want to", "I need to"). Do NOT compress nouns, drop qualifiers, or paraphrase into vague keywords.
- Examples of over-compression to AVOID:
  - Input: "Work GTD app project: make URL or the bookmark in the URL not say GTD app." → BAD title: "URL bookmark name". GOOD title: "Rename the URL/bookmark so it doesn't say 'GTD app'".
  - Input: "Ping Sarah next week about whether the Q3 forecast assumes the new pricing." → BAD title: "Sarah Q3 pricing". GOOD title: "Ask Sarah whether the Q3 forecast assumes the new pricing".
- DO NOT invent action verbs. If the user typed a noun phrase ("birthday gift", "tax stuff", "groceries"), leave the title as a noun phrase. Inventing "Buy …" or "Handle …" disguises ambiguity that the user should resolve.
- Detect GENUINE delegation/blocking only → list: waiting_for, set waiting_for_person to the name. This requires explicit "waiting for X", "waiting on X", "X needs to…", "delegated to X", "X owes me…", "until X sends/replies/responds". Do NOT set waiting_for_person for mere attribution or mentions — e.g. "from Christian", "task from the meeting", "Sarah said…", "re: John", "per Alex". A name appearing in the text is NOT delegation. If you are not confident the user is blocked on that person, leave waiting_for_person null and do NOT use the waiting_for list.
- Detect vague/aspirational items ("someday", "maybe", "one day", "would be nice") → list: someday_maybe.
- Default to next_actions if the task is clearly actionable.
- Only use inbox if the input is genuinely ambiguous or needs clarification.

LIST CONFIDENCE (critical — controls whether the task bypasses the inbox):
- list_confidence: "high" | "medium" | "low"
- IMPORTANT: judge confidence against the USER'S ORIGINAL INPUT, not your cleaned title. If you had to invent a verb, fix grammar, or guess at intent to make sense of the input, that is a strong LOW signal — even if the cleaned title now looks tidy.

- HIGH: input is unambiguous on its own. Clear actionable verb + clear category in the raw text, OR explicit "waiting for X", OR explicit aspirational language ("someday", "maybe").
- MEDIUM: list seems right but there's some doubt — vague action verb, edge-case wording, or matches the user's pattern only loosely.
- LOW (default when in doubt): the raw input is just a noun or noun phrase with no verb ("birthday gift", "tax stuff"), OR the input is so terse you had to guess, OR it could plausibly fit multiple lists. Even if you can guess a plausible action, the original wording forces a LOW classification — let the user clarify in their inbox.

EXAMPLES (these decide list_confidence):
- "buy milk friday"   → high (verb + clear noun + date)
- "call mom tomorrow" → high (verb + person + date)
- "email Sarah Q3"    → high (verb + person + topic)
- "birthday gift"     → LOW (noun phrase, no verb in the raw input)
- "tax stuff"         → LOW (vague noun, no verb)
- "follow up"         → LOW (verb but no object — what are we following up on?)
- "groceries"         → LOW (single noun)
- "remember to back up the laptop someday" → high (clear someday_maybe signal)

Respond with JSON:
{
  "title": "clear action-oriented title preserving user intent (typically 5–15 words). Strip only parsed dates/times/recurrence and filler.",
  "list": "inbox|next_actions|waiting_for|someday_maybe",
  "list_confidence": "high|medium|low",
  "context": "${contextOptions}|null",
  "priority": "integer 1-5 (5 = most urgent/important) or null",
  "energy_level": "low|medium|high",
  "time_estimate_minutes": number or null,
  "due_date": "YYYY-MM-DD or null",
  "start_date": "YYYY-MM-DD or null",
  "scheduled_time": "HH:MM 24-hour or null",
  "duration": "minutes as number or null",
  "find_free_slot": "boolean — true if user wants the server to find an open slot",
  "is_daily_focus": boolean,
  "waiting_for_person": "name ONLY when the task is genuinely blocked on/delegated to that person (explicit 'waiting for/on X', 'X needs to', 'delegated to X'). null for mere attribution/mentions like 'from X' or 'X said'.",
  "project_name": "exact project name from list or null",
  "possible_duplicate_of": "exact title of an existing open task this duplicates, or null",
  "recurrence_rule": "daily|weekly|monthly|yearly|weekdays|custom|null",
  "recurrence_interval": number or null,
  "recurrence_days": "mon,wed,fri or null",
  "reasoning": "brief plain-language explanation of what was detected and why"
}`
    }
  ];
}

export async function smartCapture(rawText, userContexts, projects, today, dayName, history = [], existingTitles = []) {
  if (!groq && !openai) return null;
  const messages = buildSmartCaptureMessages(rawText, userContexts, projects, today, dayName, history, existingTitles);
  return complete('smart-capture', { messages, response_format: { type: 'json_object' } }, validateSmartCapture);
}

export async function analyzeTask(task, userContexts, projects = [], today = null, dayName = null, history = []) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = formatContextOptions(userContexts);
  const projectBlock = projects?.length
    ? `\nActive projects (suggest the EXACT name if this task belongs to one, otherwise null):\n${projects.map(p => `- ${p.name}`).join('\n')}\n`
    : '';
  const dateLine = today ? `Today is ${dayName}, ${today}.\n` : '';
  return complete('analyze-task', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `${dateLine}Analyze this task and provide GTD recommendations:

Task: "${task.title}"
${task.notes ? `Notes: "${task.notes}"` : ''}
${projectBlock}${formatHistoryBlock(history)}
Respond with JSON:
{
  "recommended_list": "inbox|next_actions|waiting_for|someday_maybe",
  "is_actionable": boolean,
  "is_project": boolean,
  "suggested_context": "${contextOptions}|null",
  "suggested_project": "exact project name from the list above, or null",
  "energy_level": "low|medium|high",
  "time_estimate_minutes": number,
  "clarification_needed": boolean,
  "clarification_questions": ["question1", "question2"],
  "suggested_title": "improved action-oriented title if needed",
  "next_action_if_project": "if this is a project, the first concrete step to take",
  "reasoning": "brief plain-language explanation of your analysis"
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateAnalyzeTask);
}

export async function suggestProjectBreakdown(project, userContexts, existingTasks = []) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = formatContextOptions(userContexts);
  const existingBlock = existingTasks?.length
    ? `
The project ALREADY has these tasks — do NOT suggest duplicates or near-duplicates of them. Suggest only the missing steps:
${existingTasks.map(t => `- "${t.title}"${t.list === 'completed' ? ' (done)' : ''}`).join('\n')}
`
    : '';
  const modeLine = project.execution_mode === 'sequential'
    ? 'This project runs SEQUENTIALLY (one task at a time, in order) — make the "order" values a sensible step-by-step sequence.'
    : 'This project runs in PARALLEL (all tasks active at once) — suggest independent actions that can be started in any order.';
  return complete('project-breakdown', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Break down this project into actionable next actions (3-7 suggestions):

Project: "${project.name}"
${project.description ? `Description: "${project.description}"` : ''}
${project.outcome ? `Desired Outcome: "${project.outcome}"` : ''}
${modeLine}
${existingBlock}
Respond with JSON:
{
  "suggested_outcome": "clear outcome statement if not provided",
  "next_actions": [
    {
      "title": "action-oriented task title starting with verb",
      "context": "${contextOptions}",
      "energy_level": "low|medium|high",
      "time_estimate_minutes": number,
      "order": number
    }
  ],
  "potential_waiting_for": ["people or things you might need to wait for"],
  "reasoning": "brief plain-language explanation"
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateProjectBreakdown);
}

export async function processInbox(tasks, userContexts, { projects = [], today = null, dayName = null, history = [] } = {}) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = formatContextOptions(userContexts);
  const taskList = tasks.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''}`).join('\n');
  const projectBlock = projects?.length
    ? `\nActive projects (use the EXACT name when an item clearly belongs to one, otherwise null):\n${projects.map(p => `- ${p.name}`).join('\n')}\n`
    : '';
  const dateLine = today
    ? `Today is ${dayName}, ${today}. Resolve relative dates in items ("tomorrow", "Friday", "before it lapses this month") to absolute YYYY-MM-DD due dates when the item clearly implies one; otherwise leave due_date null.\n`
    : '';

  return complete('process-inbox', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Process these inbox items and categorize them:

${taskList}

${dateLine}${projectBlock}${formatHistoryBlock(history)}
CONFIDENCE RULES — be honest about uncertainty:
- "high": the answer is explicitly stated or unambiguously implied by the title/notes
- "medium": a reasonable inference from clear signals (verb form, named entities)
- "low": a weak guess. Prefer null + "low" over speculation. Do not infer values from sibling items.

For each item, respond with JSON:
{
  "processed_items": [
    {
      "original_index": number,
      "recommended_list": "next_actions|waiting_for|someday_maybe",
      "is_project": boolean,
      "suggested_title": "improved title if needed",
      "context": "${contextOptions}|null",
      "project_name": "exact project name from the list above, or null",
      "priority": "integer 1-5 (5 = most urgent/important) or null",
      "due_date": "YYYY-MM-DD or null",
      "energy_level": "low|medium|high|null",
      "time_estimate_minutes": number or null,
      "waiting_for_person": "name ONLY when genuinely blocked on/delegated to that person AND recommended_list is waiting_for, else null",
      "confidence": {
        "list": "high|medium|low",
        "context": "high|medium|low",
        "priority": "high|medium|low",
        "due_date": "high|medium|low",
        "project": "high|medium|low"
      },
      "reasoning": "brief plain-language explanation"
    }
  ],
  "suggested_daily_focus": [indexes of items that should be today's focus]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateProcessInbox(tasks.length));
}

export async function importNotes(rawText, userContexts, projects = [], today, dayName) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  const projectList = projects?.length
    ? projects.map(p => `- ${p.name}`).join('\n')
    : '(none)';
  const dateLine = today ? `Today is ${dayName}, ${today}. Resolve relative dates (e.g. "tomorrow", "Friday", "next week") to absolute YYYY-MM-DD.` : '';
  return complete('import-notes', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `A user is importing notes from another app. Parse the following text into individual items and categorize each one using GTD methodology.

Split the text into logical items — each line, bullet point, or distinct thought should become a separate item. Ignore empty lines.

${dateLine}

Active projects (use exact name when an item belongs to one, otherwise null):
${projectList}

Text to import:
"""
${rawText}
"""

CONFIDENCE RULES — be honest about uncertainty for every field:
- "high": the answer is explicitly stated or unambiguously implied by THIS item's text alone
- "medium": a reasonable inference from clear signals in THIS item (verb form, named entities, keywords)
- "low": a weak guess. Prefer null + "low" over speculation.
- CRITICAL: Treat each item INDEPENDENTLY. Do NOT infer values from sibling items in the same import. If item 3 mentions "Project X", that does NOT make item 5 part of "Project X". Each item must be judged on its own text.
- Only assign project_name if the item itself contains keywords that match the project. If unsure, return null + "low".
- Only set is_daily_focus = true if the item itself signals urgency ("today", "ASAP", "urgent"). Default false + "high".

Respond with JSON:
{
  "items": [
    {
      "title": "clear action-oriented title starting with a verb if actionable",
      "notes": "any additional details from the original text, or null",
      "recommended_list": "inbox|next_actions|waiting_for|someday_maybe",
      "context": "${contextOptions}|null",
      "project_name": "exact name from list above, or null",
      "due_date": "YYYY-MM-DD or null",
      "waiting_for_person": "name ONLY when genuinely blocked on/delegated to that person (explicit 'waiting for/on X', 'X needs to', 'delegated to X') AND recommended_list is waiting_for. null for mere attribution/mentions like 'from X' or 'X said'.",
      "is_daily_focus": boolean (true only if clearly urgent/today),
      "priority": "integer 1-5 (5 = most urgent/important) or null",
      "energy_level": "low|medium|high|null",
      "time_estimate": null or number in minutes,
      "is_project": boolean,
      "confidence": {
        "list": "high|medium|low",
        "context": "high|medium|low",
        "project": "high|medium|low",
        "due_date": "high|medium|low",
        "energy": "high|medium|low",
        "time": "high|medium|low",
        "waiting_for": "high|medium|low",
        "daily_focus": "high|medium|low"
      },
      "reasoning": "brief plain-language explanation of categorization"
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateImportNotes);
}

export async function getDailyPriorities(tasks, stats, userContexts, { today = null, dayName = null, scheduledToday = null } = {}) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
    // Every date signal the model needs to reason about urgency: due date,
    // days overdue, deferred-until, priority. Without these it was picking
    // "today's focus" by title vibes alone.
    const taskList = tasks.map((t, i) => {
      const parts = [`${i + 1}. "${t.title}" [${t.context || 'no context'}]`];
      if (t.project_name) parts.push(`(Project: ${t.project_name})`);
      if (t.due_date) {
        const due = String(t.due_date).slice(0, 10);
        if (today && due < today) {
          const overdueDays = Math.round((new Date(today) - new Date(due)) / 86400000);
          parts.push(`Due: ${due} (OVERDUE by ${overdueDays} day${overdueDays === 1 ? '' : 's'})`);
        } else if (today && due === today) {
          parts.push(`Due: TODAY`);
        } else {
          parts.push(`Due: ${due}`);
        }
      }
      if (t.start_date) parts.push(`Starts: ${String(t.start_date).slice(0, 10)}`);
      if (t.priority) parts.push(`Priority: ${t.priority}/5`);
      parts.push(`Energy: ${t.energy_level || 'unknown'}, Time: ${t.time_estimate || 'unknown'}min`);
      return parts.join(' ');
    }).join('\n');

    const dateLine = today ? `Today is ${dayName}, ${today}.` : '';
    const loadLine = scheduledToday
      ? `- Already time-blocked today: ${scheduledToday.count} task(s), ~${scheduledToday.minutes} minutes committed`
      : '';

    return complete('daily-priorities', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `${dateLine}
Given these next actions, suggest which should be the daily focus (max 5-7 items for a productive day):

Current Stats:
- Inbox items: ${stats.inbox}
- Completed today: ${stats.completed_today}
${loadLine}

Available Next Actions:
${taskList}

SELECTION RULES:
- Tasks due TODAY or OVERDUE are the strongest candidates — surface them first unless clearly superseded.
- Respect the time already committed: if hours are time-blocked, suggest fewer additional items.
- A task with "Starts:" in the future is deferred — do NOT suggest it.
- Balance the day: avoid suggesting 5 high-energy deep-work items at once.

CONFIDENCE RULES — be honest about uncertainty for each suggestion:
- "high": clear signal it belongs in today's focus (due today, overdue, urgent, blocking other work)
- "medium": good candidate based on context, but not the strongest pick
- "low": filler — only suggest if the user clearly needs more items. Prefer fewer high-confidence picks over padding the list with low-confidence ones.
- It is OK to return fewer than 5 items if only a few are truly worth focusing on today.

Respond with JSON:
{
  "suggested_focus": [
    {
      "task_index": number,
      "confidence": "high|medium|low",
      "reason": "plain-language reason this belongs on today's list"
    }
  ],
  "productivity_tip": "a practical tip for the day, in plain language",
  "warning": "any concerns about overload or inbox buildup"
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateDailyPriorities(tasks.length));
}

const nextDay = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// The day planner: given candidate tasks and the day's real shape (free
// windows, meetings, habits), the model selects + orders + defers + explains;
// it never does the slot arithmetic unsupervised. After the model responds,
// packPlan deterministically re-places every block into the actual free
// ranges — proposals that fit are kept, conflicts are moved, and what can't
// fit is deferred to tomorrow. The returned plan is guaranteed conflict-free.
//
// `day` = { today, dayName, freeRanges, totalFreeMins, workStart, workEnd,
//           meetings: [{title, start, end}]  (minutes-of-day),
//           habits: [{name, completed_today}] }
export async function planDay(tasks, day, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };

  const taskList = tasks.map((t, i) => {
    const parts = [`${i + 1}. "${t.title}" [${t.context || 'no context'}]`];
    if (t.project_name) parts.push(`(Project: ${t.project_name})`);
    if (t.due_date) {
      const due = String(t.due_date).slice(0, 10);
      if (due < day.today) {
        const overdueDays = Math.round((new Date(day.today) - new Date(due)) / 86400000);
        parts.push(`Due: ${due} (OVERDUE by ${overdueDays} day${overdueDays === 1 ? '' : 's'})`);
      } else if (due === day.today) {
        parts.push('Due: TODAY');
      } else {
        parts.push(`Due: ${due}`);
      }
    }
    if (t.start_date) parts.push(`Starts: ${String(t.start_date).slice(0, 10)}`);
    if (t.priority) parts.push(`Priority: ${t.priority}/5`);
    parts.push(`Energy: ${t.energy_level || 'unknown'}, Time: ${t.time_estimate || 'unknown'}min`);
    return parts.join(' ');
  }).join('\n');

  const meetingsLine = day.meetings.length
    ? day.meetings.map(m => `${minutesToTime(m.start)}-${minutesToTime(m.end)} "${m.title}"`).join(', ')
    : 'none';
  const freeLine = day.freeRanges.length
    ? day.freeRanges.map(r => `${minutesToTime(r.start)}-${minutesToTime(r.end)} (${r.end - r.start}m)`).join(', ')
    : 'none';
  const habitsLine = day.habits.length
    ? day.habits.map(h => `${h.name}${h.completed_today ? ' (done)' : ''}`).join(', ')
    : 'none';

  const parsed = await complete('plan-day', {
    messages: [
      { role: 'system', content: getSystemPrompt(userContexts) },
      {
        role: 'user',
        content: `Today is ${day.dayName}, ${day.today}. Build a realistic, calm plan for today from the candidate tasks below.

THE DAY:
- Working hours: ${minutesToTime(day.workStart)}-${minutesToTime(day.workEnd)}
- Busy (meetings + already-scheduled blocks): ${meetingsLine}
- Free windows: ${freeLine} — ${day.totalFreeMins} free minutes in total
- Habits today (context only — never schedule habits as blocks): ${habitsLine}

CANDIDATE TASKS:
${taskList}

PLANNING RULES:
- Place blocks INSIDE the free windows only; blocks must not overlap each other or the busy times.
- Be realistic, not ambitious: plan at most ~80% of the free minutes. 3-6 blocks is a good day; fewer is fine.
- duration_mins comes from the task's time estimate; when unknown, guess honestly (30 is a sane default).
- Tasks due TODAY or OVERDUE come first unless clearly superseded.
- Match energy to the day: high-energy/deep work in the longest early windows, shallow tasks in short gaps.
- A task with "Starts:" in the future is deferred by the user — never plan it.
- Everything worth doing that does NOT fit goes in "deferred" with a concrete date (tomorrow or the next sensible day) and an honest reason. Deferring is the plan protecting the day, not failing.
- Set "overloaded": true when meaningful work didn't fit today.
- "summary": ONE calm sentence about the shape of the day (e.g. "Three focused blocks around your two meetings; two things moved to Thursday.").

Respond with JSON:
{
  "plan": [{ "task_index": number, "start": "HH:MM", "duration_mins": number, "reason": "why now, plain language" }],
  "deferred": [{ "task_index": number, "move_to": "YYYY-MM-DD", "reason": "honest reason it moved" }],
  "summary": "one calm sentence",
  "overloaded": boolean
}`
      }
    ],
    response_format: { type: 'json_object' }
  }, validatePlanDay(tasks.length));

  if (!parsed || parsed.error) return parsed;

  // Deterministic reconciliation — the guarantee layer.
  // Belt and braces: a task the user deferred (start_date in the future) is
  // never planned, even if the model ignores the rule. The route's candidate
  // query already excludes these; this covers direct callers and model slip.
  const deferredByUser = (idx) => {
    const t = tasks[idx - 1];
    return t?.start_date && String(t.start_date).slice(0, 10) > day.today;
  };
  const blocks = (parsed.plan || [])
    .filter(b => !deferredByUser(b.task_index))
    .map(b => ({
      task_index: b.task_index,
      start: timeToMinutes(b.start),
      duration: b.duration_mins,
      reason: b.reason || '',
    }));
  const { placed, overflow } = packPlan(blocks, day.freeRanges);

  const deferred = (Array.isArray(parsed.deferred) ? parsed.deferred : [])
    .filter(d => !placed.some(p => p.task_index === d.task_index))
    .map(d => ({
      task_index: d.task_index,
      move_to: d.move_to || nextDay(day.today),
      reason: d.reason || '',
    }));
  for (const o of overflow) {
    if (!deferred.some(d => d.task_index === o.task_index)) {
      deferred.push({ task_index: o.task_index, move_to: nextDay(day.today), reason: 'No room left in today’s free windows.' });
    }
  }

  return {
    plan: placed.map(p => ({
      task_index: p.task_index,
      start: minutesToTime(p.start),
      duration_mins: p.duration,
      reason: p.reason,
      moved: !!p.moved,
    })),
    deferred,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    overloaded: parsed.overloaded === true || overflow.length > 0,
  };
}

export async function findDuplicates(tasks, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
    const taskList = tasks.map(t =>
      `[ID:${t.id}] "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''} [List: ${t.list}]${t.context ? ` [Context: ${t.context}]` : ''}${t.recurrence_rule ? ` [Recurring: ${t.recurrence_rule}]` : ''}`
    ).join('\n');

    return complete('find-duplicates', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Analyze these tasks and find groups of duplicate or very similar items. Two tasks are duplicates if they refer to the same action, even if worded differently. Do NOT flag tasks that are merely related but distinct actions.
A task marked [Recurring: ...] repeats by design — never flag it as a duplicate of its own past/future occurrences or of a similar one-off task.
When choosing which task to keep, prefer the one whose title/notes carry the most information; if the others contain unique details, say so in "reason" so the user can copy them over before deleting.

Tasks:
${taskList}

Respond with JSON:
{
  "duplicate_groups": [
    {
      "reason": "brief explanation of why these are duplicates",
      "tasks": [
        { "id": number, "title": "task title", "keep": boolean }
      ]
    }
  ],
  "summary": "short summary like 'Found 3 groups of duplicates' or 'No duplicates found'"
}

For each group, mark exactly one task as "keep": true (the most complete, best-worded, or most specific one). Mark the rest as "keep": false.
If no duplicates exist, return an empty duplicate_groups array.`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateFindDuplicates);
}

export async function weeklyReviewAnalysis(data, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
    const nextActionsShown = Math.min(data.nextActions.length, 30);
    const waitingShown = Math.min(data.waitingFor.length, 20);
    const nextActionsList = data.nextActions.slice(0, 30).map(t => {
      const age = Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return `[ID:${t.id}] "${t.title}" [Context: ${t.context || 'none'}]${t.project_name ? ` [Project: ${t.project_name}]` : ''}${t.due_date ? ` [Due: ${t.due_date}]` : ''} (${age} days old)`;
    }).join('\n');

    const waitingForList = data.waitingFor.slice(0, 20).map(t => {
      const age = Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return `[ID:${t.id}] "${t.title}" [Waiting for: ${t.waiting_for_person || 'unknown'}] (${age} days)`;
    }).join('\n');

    const projectsList = data.projects.map(p =>
      `"${p.name}" [Status: ${p.status}] [Tasks: ${p.task_count}] [Mode: ${p.execution_mode || 'parallel'}] [Has next action: ${p.next_action ? 'yes' : 'NO'}]`
    ).join('\n');

    const staleList = data.staleItems.map(t => {
      const age = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      return `[ID:${t.id}] "${t.title}" [List: ${t.list}] (${age} days without update)`;
    }).join('\n');

    const habitSummary = data.habitStats?.habits?.map(h =>
      `"${h.name}" — ${h.completionRate}% completion, ${h.streak} day streak`
    ).join('\n') || 'No habits tracked';

    // A sample of someday/maybe items makes the "Get Creative" step real:
    // without it the model can only do health/stale analysis.
    const somedayList = (data.somedayMaybe || []).slice(0, 15).map(t =>
      `[ID:${t.id}] "${t.title}"`
    ).join('\n');
    const somedayShown = Math.min((data.somedayMaybe || []).length, 15);

    return complete('weekly-review', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Conduct a GTD Weekly Review analysis of this user's system. Be specific, actionable, and encouraging.

System State:
- Inbox: ${data.stats.inbox} items
- Next Actions: ${data.stats.next_actions} items
- Waiting For: ${data.stats.waiting_for} items
- Someday/Maybe: ${data.stats.someday_maybe} items
- Completed this week: ${data.completedThisWeek}
- Last review: ${data.lastReviewDate || 'Never'}

Next Actions (showing ${nextActionsShown} of ${data.stats.next_actions} — judge patterns, not totals, from this sample):
${nextActionsList || 'None'}

Waiting For (showing ${waitingShown} of ${data.stats.waiting_for}):
${waitingForList || 'None'}

Projects (${data.projects.length}):
${projectsList || 'None'}

Stale Items (unchanged 14+ days):
${staleList || 'None'}

Someday/Maybe (showing ${somedayShown} of ${data.stats.someday_maybe}):
${somedayList || 'None'}

Habits:
${habitSummary}

Respond with JSON:
{
  "weekly_summary": "2-3 sentence overview of the week's productivity and system state",
  "tasks_completed_insight": "observation about completion patterns",
  "stale_items": [
    { "id": number, "title": "...", "list": "...", "days_stale": number, "suggestion": "delete|move_to_someday|follow_up|keep", "reason": "why this suggestion, in plain language" }
  ],
  "projects_needing_attention": [
    { "name": "...", "issue": "no_next_action|stalled|too_many_tasks", "suggestion": "specific actionable suggestion" }
  ],
  "waiting_for_followups": [
    { "id": number, "title": "...", "waiting_for_person": "...", "days_waiting": number, "suggestion": "specific follow-up action" }
  ],
  "someday_candidates": [
    { "id": number, "title": "...", "reason": "why now might be the season to activate this parked idea (pick 0-3 that genuinely fit the week ahead; empty array if none do)" }
  ],
  "recommendations": ["3-5 actionable recommendations for next week"],
  "motivational_insight": "encouraging observation about progress or habits",
  "system_health_score": number from 1-10
}`
        }
      ],
      response_format: { type: 'json_object' }
    }, validateWeeklyReview);
}

function extractMeta(html, property, attr = 'property') {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${property}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

// SSRF guard: the URL is user-supplied and this server runs on Railway, so a
// fetch must never reach loopback, LAN, link-local (cloud metadata at
// 169.254.169.254), or other non-routable ranges — directly or via redirect.
function isPrivateIp(ip) {
  if (net.isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    if (/^(fc|fd|fe[89ab])/.test(v6)) return true; // ULA fc00::/7, link-local fe80::/10
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)   // CGNAT
    || (a === 169 && b === 254)             // link-local / cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)); // benchmarking
}

async function assertPublicUrl(rawUrl) {
  const parsed = new URL(rawUrl); // throws on garbage
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (addrs.some(({ address }) => isPrivateIp(address))) {
    throw new Error('URL resolves to a non-public address');
  }
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function extractUrlMetadata(url) {
  if (!openai && !groq) return null;

  let pageTitle = '';
  let ogTitle = '';
  let ogDescription = '';
  let metaDescription = '';
  let author = '';
  let extraMeta = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Redirects are followed manually so every hop gets the same SSRF check —
    // a public URL 302ing to an internal address must not be fetched.
    let res;
    let currentUrl = url;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(currentUrl);
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: FETCH_HEADERS,
      });
      const location = res.headers.get('location');
      if (![301, 302, 303, 307, 308].includes(res.status) || !location) break;
      currentUrl = new URL(location, currentUrl).toString();
    }
    clearTimeout(timeout);
    // Cap how much HTML we hold/parse — a hostile page shouldn't OOM the server.
    const html = (await res.text()).slice(0, 500_000);

    pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    ogTitle = extractMeta(html, 'og:title');
    ogDescription = extractMeta(html, 'og:description');
    metaDescription = extractMeta(html, 'description', 'name');
    author = extractMeta(html, 'author', 'name')
      || extractMeta(html, 'book:author')
      || extractMeta(html, 'article:author');

    const byline = html.match(/class=["'][^"']*(?:author|byline|contributor)[^"']*["'][^>]*>([^<]{2,80})</i)?.[1]?.trim() || '';
    if (byline) extraMeta += `Author element: ${byline}\n`;
  } catch (e) {
    // page fetch failed — AI will work with just the URL
  }

  return complete('url-extract', {
      messages: [
        {
          role: 'system',
          content: `You extract clean, human-readable titles from URLs and their page metadata.
Return a JSON object with:
- "title": a clean, concise title. For books: "Title by Author". For movies/shows: "Title (Year)". For products: brand + product name. For articles: article headline. Strip store names, SEO junk, and formatting artifacts. ALWAYS include the author/creator when available — check all provided metadata fields.
- "notes": a one-line description if available, otherwise null.`
        },
        {
          role: 'user',
          content: `URL: ${url}
Page title: ${pageTitle}
OG title: ${ogTitle}
OG description: ${ogDescription}
Meta description: ${metaDescription}
Author meta: ${author}
${extraMeta}`.trim()
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });
}
