import OpenAI from 'openai';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

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
  'process-inbox':     { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o' } },
  'import-notes':      { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o' } },
  'find-duplicates':   { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o' } },
  'url-extract':       { primary: { provider: 'groq',   model: GROQ },     fallback: { provider: 'openai', model: 'gpt-4o-mini' } },
  // Advisory ops (low-frequency, high-judgment). Flipped to Groq primary with a
  // gpt-4o fallback on 2026-06-30 after OpenAI hit a billing/quota 429 that left
  // all four dead (fallback was null). Structural parity was proven in eval
  // (scripts/eval-heavy-ops.mjs); advice-quality on Groq is still unverified, so
  // gpt-4o stays as the fallback and auto-resumes as the path of choice once
  // OpenAI credit is restored (swap primary/fallback back to revert).
  'daily-priorities':  { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4o' } },
  'analyze-task':      { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4o' } },
  'project-breakdown': { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4o' } },
  'weekly-review':     { primary: { provider: 'groq', model: GROQ }, fallback: { provider: 'openai', model: 'gpt-4o' } },
};

// Test-only: force every complete() call onto one {provider, model}, bypassing
// ROUTING, so scripts/eval-* can A/B models against the real functions. Never set
// in production code.
let _forceRoute = null;
export function __setForceRoute(r) { _forceRoute = r; }

// Unified chat completion with provider routing + automatic fallback. Returns
// parsed JSON, or null if every available provider fails (the caller then does
// its own fallback — e.g. Smart Capture saves the raw text). A JSON.parse failure
// is treated as a provider failure and advances to the fallback provider.
async function complete(task, params) {
  const route = ROUTING[task];
  const attempts = _forceRoute ? [_forceRoute] : [route?.primary, route?.fallback].filter(Boolean);
  let lastErr = null;
  for (const { provider, model } of attempts) {
    const client = PROVIDERS[provider];
    if (!client) continue;
    try {
      const res = await client.chat.completions.create({ ...params, model });
      return JSON.parse(res.choices[0].message.content);
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

Always respond in JSON format as specified in each request.`;
}

export function buildSmartCaptureMessages(rawText, userContexts, projects, today, dayName, history = []) {
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  const projectList = projects?.length
    ? projects.map(p => p.name).join(', ')
    : '';
  // Build a few-shot block from the user's own past classifications so the AI
  // learns their personal pattern (e.g. "call mom" → Personal, not Phone).
  const historyBlock = history?.length
    ? `
USER'S RECENT CLASSIFICATIONS (mirror this pattern when ambiguous):
${history.map(h => `- "${h.title}" → context: ${h.context}${h.list ? `, list: ${h.list}` : ''}`).join('\n')}

Treat these as the strongest hints about how THIS user actually organizes tasks. If a new input is similar to one of these, copy the classification choice.
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

${historyBlock}
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
  "priority": 1-5,
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
  "recurrence_rule": "daily|weekly|monthly|yearly|weekdays|custom|null",
  "recurrence_interval": number or null,
  "recurrence_days": "mon,wed,fri or null",
  "reasoning": "brief explanation of what was detected and why"
}`
    }
  ];
}

export async function smartCapture(rawText, userContexts, projects, today, dayName, history = []) {
  if (!groq && !openai) return null;
  const messages = buildSmartCaptureMessages(rawText, userContexts, projects, today, dayName, history);
  return complete('smart-capture', { messages, response_format: { type: 'json_object' } });
}

export async function analyzeTask(task, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  return complete('analyze-task', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Analyze this task and provide GTD recommendations:

Task: "${task.title}"
${task.notes ? `Notes: "${task.notes}"` : ''}

Respond with JSON:
{
  "recommended_list": "inbox|next_actions|waiting_for|someday_maybe",
  "is_actionable": boolean,
  "is_project": boolean,
  "suggested_context": "${contextOptions}|null",
  "energy_level": "low|medium|high",
  "time_estimate_minutes": number,
  "clarification_needed": boolean,
  "clarification_questions": ["question1", "question2"],
  "suggested_title": "improved action-oriented title if needed",
  "next_action_if_project": "the very next physical action if this is a project",
  "reasoning": "brief explanation of your analysis"
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
}

export async function suggestProjectBreakdown(project, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  return complete('project-breakdown', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Break down this project into actionable next actions:

Project: "${project.name}"
${project.description ? `Description: "${project.description}"` : ''}
${project.outcome ? `Desired Outcome: "${project.outcome}"` : ''}

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
  "reasoning": "brief explanation"
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
}

export async function processInbox(tasks, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  const taskList = tasks.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''}`).join('\n');

  return complete('process-inbox', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Process these inbox items and categorize them:

${taskList}

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
      "priority": 1-5,
      "confidence": {
        "list": "high|medium|low",
        "context": "high|medium|low",
        "priority": "high|medium|low"
      },
      "reasoning": "brief explanation"
    }
  ],
  "suggested_daily_focus": [indexes of items that should be today's focus]
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
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
      "priority": 1-5,
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
      "reasoning": "brief explanation of categorization"
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
}

export async function getDailyPriorities(tasks, stats, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
    const taskList = tasks.map((t, i) => 
      `${i + 1}. "${t.title}" [${t.context || 'no context'}] ${t.project_name ? `(Project: ${t.project_name})` : ''} Energy: ${t.energy_level || 'unknown'}, Time: ${t.time_estimate || 'unknown'}min`
    ).join('\n');
    
    return complete('daily-priorities', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Given these next actions, suggest which should be the daily focus (max 5-7 items for a productive day):

Current Stats:
- Inbox items: ${stats.inbox}
- Completed today: ${stats.completed_today}

Available Next Actions:
${taskList}

CONFIDENCE RULES — be honest about uncertainty for each suggestion:
- "high": clear signal it belongs in today's focus (due today, urgent, blocking other work, perfectly matches available energy/time)
- "medium": good candidate based on context, but not the strongest pick
- "low": filler — only suggest if the user clearly needs more items. Prefer fewer high-confidence picks over padding the list with low-confidence ones.
- It is OK to return fewer than 5 items if only a few are truly worth focusing on today.

Respond with JSON:
{
  "suggested_focus": [
    {
      "task_index": number,
      "confidence": "high|medium|low",
      "reason": "why this should be a focus today"
    }
  ],
  "productivity_tip": "a GTD-based tip for the day",
  "warning": "any concerns about overload or inbox buildup"
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
}

export async function findDuplicates(tasks, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
    const taskList = tasks.map(t =>
      `[ID:${t.id}] "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''} [List: ${t.list}]${t.context ? ` [Context: ${t.context}]` : ''}`
    ).join('\n');

    return complete('find-duplicates', {
      messages: [
        { role: 'system', content: getSystemPrompt(userContexts) },
        {
          role: 'user',
          content: `Analyze these tasks and find groups of duplicate or very similar items. Two tasks are duplicates if they refer to the same action, even if worded differently. Do NOT flag tasks that are merely related but distinct actions.

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
    });
}

export async function weeklyReviewAnalysis(data, userContexts) {
  if (!openai && !groq) return { error: 'AI provider not configured' };
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

Next Actions:
${nextActionsList || 'None'}

Waiting For:
${waitingForList || 'None'}

Projects (${data.projects.length}):
${projectsList || 'None'}

Stale Items (unchanged 14+ days):
${staleList || 'None'}

Habits:
${habitSummary}

Respond with JSON:
{
  "weekly_summary": "2-3 sentence overview of the week's productivity and system state",
  "tasks_completed_insight": "observation about completion patterns",
  "stale_items": [
    { "id": number, "title": "...", "list": "...", "days_stale": number, "suggestion": "delete|move_to_someday|follow_up|keep", "reason": "why this suggestion" }
  ],
  "projects_needing_attention": [
    { "name": "...", "issue": "no_next_action|stalled|too_many_tasks", "suggestion": "specific actionable suggestion" }
  ],
  "waiting_for_followups": [
    { "id": number, "title": "...", "waiting_for_person": "...", "days_waiting": number, "suggestion": "specific follow-up action" }
  ],
  "recommendations": ["3-5 actionable recommendations for next week"],
  "motivational_insight": "encouraging observation about progress or habits",
  "system_health_score": number from 1-10
}`
        }
      ],
      response_format: { type: 'json_object' }
    });
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
