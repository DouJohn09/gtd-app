import OpenAI from 'openai';

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

const GTD_SYSTEM_PROMPT = `You are a GTD (Getting Things Done) productivity assistant based on David Allen's methodology. 
Your role is to help users process, organize, and clarify their tasks and projects.

GTD Lists:
- inbox: Unprocessed items that need clarification
- next_actions: Clear, actionable tasks that can be done immediately (should start with a verb)
- waiting_for: Tasks delegated to others that you're tracking
- someday_maybe: Ideas and tasks for potential future action

Contexts (optional tags for next_actions):
@home, @work, @errands, @computer, @phone, @anywhere

When analyzing tasks:
1. Check if it's actionable - if not, it goes to someday_maybe or trash
2. If actionable, determine if it's a single action or a project (multi-step)
3. For projects, identify the next physical action
4. Consider energy level (low/medium/high) and time estimate in minutes
5. Identify if task is clear enough or needs clarification

Always respond in JSON format as specified in each request.`;

export async function analyzeTask(task) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GTD_SYSTEM_PROMPT },
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
  "suggested_context": "@home|@work|@errands|@computer|@phone|@anywhere|null",
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

export async function suggestProjectBreakdown(project) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GTD_SYSTEM_PROMPT },
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
      "context": "@home|@work|@errands|@computer|@phone|@anywhere",
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

export async function processInbox(tasks) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const taskList = tasks.map((t, i) => `${i + 1}. "${t.title}"${t.notes ? ` (Notes: ${t.notes})` : ''}`).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GTD_SYSTEM_PROMPT },
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
      "context": "@home|@work|@errands|@computer|@phone|@anywhere|null",
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

export async function getDailyPriorities(tasks, stats) {
  if (!openai) return { error: 'OpenAI API key not configured' };
  try {
    const taskList = tasks.map((t, i) => 
      `${i + 1}. "${t.title}" [${t.context || 'no context'}] ${t.project_name ? `(Project: ${t.project_name})` : ''} Energy: ${t.energy_level || 'unknown'}, Time: ${t.time_estimate || 'unknown'}min`
    ).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GTD_SYSTEM_PROMPT },
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
