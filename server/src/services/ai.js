import OpenAI from 'openai';

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
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

export async function smartCapture(rawText, userContexts, projects, today, dayName) {
  if (!openai) return null;
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  const projectList = projects?.length
    ? projects.map(p => p.name).join(', ')
    : '';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
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

CONTEXT RULES (personal vs work detection):
- Context should match one of: ${contextOptions} — or null if unclear.
- Detect whether the task is personal or work-related based on keywords and intent:
  - WORK signals: report, meeting, client, project, deadline, presentation, review, budget, stakeholder, sprint, deploy, colleague names, professional activities
  - PERSONAL signals: family members (mom, dad, kids), groceries, doctor, gym, home repairs, hobbies, friends, personal errands
- Assign @work for work tasks, @home for home/personal tasks, @phone for calls, @errands for shopping/errands, @computer for digital tasks
- If the task is clearly work-related, prefer @work or @computer. If personal, prefer @home, @phone, or @errands as appropriate.
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
- Clean the title: remove parsed date/time references and recurrence patterns but keep the core action. Make it action-oriented (start with a verb).
- Detect "waiting for [person]" patterns → list: waiting_for, extract person name.
- Detect vague/aspirational items ("someday", "maybe", "one day", "would be nice") → list: someday_maybe.
- Default to next_actions if the task is clearly actionable.
- Only use inbox if the input is genuinely ambiguous or needs clarification.

Respond with JSON:
{
  "title": "cleaned action-oriented title without date references",
  "list": "inbox|next_actions|waiting_for|someday_maybe",
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
  "waiting_for_person": "person name or null",
  "project_name": "exact project name from list or null",
  "recurrence_rule": "daily|weekly|monthly|yearly|weekdays|custom|null",
  "recurrence_interval": number or null,
  "recurrence_days": "mon,wed,fri or null",
  "reasoning": "brief explanation of what was detected and why"
}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Smart capture AI error:', error);
    return null;
  }
}

export async function analyzeTask(task, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

export async function suggestProjectBreakdown(project, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI project breakdown error:', error);
    return null;
  }
}

export async function processInbox(tasks, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  try {
    const taskList = tasks.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''}`).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI inbox processing error:', error);
    return null;
  }
}

export async function importNotes(rawText, userContexts, projects = [], today, dayName) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  const contextOptions = userContexts?.length
    ? userContexts.map(c => c.name || c).join('|')
    : '@home|@work|@errands|@computer|@phone|@anywhere';
  const projectList = projects?.length
    ? projects.map(p => `- ${p.name}`).join('\n')
    : '(none)';
  const dateLine = today ? `Today is ${dayName}, ${today}. Resolve relative dates (e.g. "tomorrow", "Friday", "next week") to absolute YYYY-MM-DD.` : '';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
      "waiting_for_person": "name of person if recommended_list is waiting_for, else null",
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI import notes error:', error);
    return null;
  }
}

export async function getDailyPriorities(tasks, stats, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const taskList = tasks.map((t, i) => 
      `${i + 1}. "${t.title}" [${t.context || 'no context'}] ${t.project_name ? `(Project: ${t.project_name})` : ''} Energy: ${t.energy_level || 'unknown'}, Time: ${t.time_estimate || 'unknown'}min`
    ).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI daily priorities error:', error);
    return null;
  }
}

export async function findDuplicates(tasks, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const taskList = tasks.map(t =>
      `[ID:${t.id}] "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''} [List: ${t.list}]${t.context ? ` [Context: ${t.context}]` : ''}`
    ).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI find duplicates error:', error);
    return null;
  }
}

export async function weeklyReviewAnalysis(data, userContexts) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI weekly review error:', error);
    return null;
  }
}
