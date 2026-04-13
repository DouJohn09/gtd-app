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

export async function importNotes(rawText, userContexts) {
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
          content: `A user is importing notes from another app. Parse the following text into individual items and categorize each one using GTD methodology.

Split the text into logical items — each line, bullet point, or distinct thought should become a separate item. Ignore empty lines.

Text to import:
"""
${rawText}
"""

Respond with JSON:
{
  "items": [
    {
      "title": "clear action-oriented title starting with a verb if actionable",
      "notes": "any additional details from the original text, or null",
      "recommended_list": "inbox|next_actions|waiting_for|someday_maybe",
      "context": "${contextOptions}|null",
      "priority": 1-5,
      "energy_level": "low|medium|high|null",
      "time_estimate": null or number in minutes,
      "is_project": boolean,
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

Respond with JSON:
{
  "suggested_focus": [
    {
      "task_index": number,
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
