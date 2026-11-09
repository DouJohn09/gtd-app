# ChatGPT app directory: review test cases

Paste into the portal's Review Details. Run each one in ChatGPT, signed in as review@cleartable.app, before submitting, and record the demo video from the same run.

Logo: `client/public/icons/icon-512.png`

## Positive cases (7)

**1. Capture several tasks from a brain dump**
- Scenario: the user thinks out loud and wants the to-dos saved and sorted.
- Prompt: "Put this in Cleartable: call the dentist tomorrow, renew the car insurance by Friday, and someday learn to paint."
- Tool: `capture_tasks`
- Expected: three separate tasks are created. The dentist task is due tomorrow, the insurance task is due Friday, and painting goes to Someday. ChatGPT confirms what was added and links to the app.

**2. See what is on today**
- Scenario: the user starts the day and asks what needs doing.
- Prompt: "What's on my plate today in Cleartable?"
- Tool: `get_today`
- Expected: a short list of tasks due or picked for today (overdue ones flagged), plus today's habits. Calendar events appear only if the account has Google Calendar connected.

**3. Add one exact task**
- Scenario: the user wants one specific task with a fixed date and no AI sorting.
- Prompt: "Add a task 'Renew passport' to my next actions, due December 15."
- Tool: `add_task`
- Expected: one task, "Renew passport", in Next actions with due date December 15.

**4. Find a task and mark it done**
- Scenario: the user finished something and wants it ticked off.
- Prompt: "I called the dentist, mark that done in Cleartable."
- Tools: `list_tasks` (search "dentist"), then `complete_task`
- Expected: the dentist task is completed. ChatGPT names the task it completed.

**5. Reschedule a task and move it to a project**
- Scenario: plans changed.
- Prompt: "Move 'Book car service' to next Monday and put it in my Work project."
- Tools: `list_projects`, `list_tasks`, `update_task`
- Expected: that task's due date becomes next Monday and its project becomes Work. Nothing else about the task changes.

**6. Create a project and add a detailed task to it**
- Scenario: the user starts something new that takes several steps.
- Prompt: "Create a project called Website refresh in Cleartable, then add a task to it: 'Write the new homepage copy', next actions, 90 minute estimate, high energy, @computer."
- Tools: `create_project`, `add_task`
- Expected: a new project, "Website refresh", and one task in it, in Next actions, with a 90 minute estimate, high energy and the @computer context. ChatGPT confirms both and links to the app.

**7. Review a project and put it on hold**
- Scenario: the user pauses something they started. Depends on case 6.
- Prompt: "Show me what's in my Website refresh project in Cleartable, then put that project on hold."
- Tools: `list_tasks` (project "Website refresh"), `list_projects`, `update_project`
- Expected: ChatGPT lists the project's task, then sets the project to on hold. The task itself stays open.

## Negative cases (3)

**1. Request to delete tasks**
- Scenario: the user asks for something the app deliberately cannot do.
- Prompt: "Delete all my tasks in Cleartable."
- Expected: no tool deletes anything (there is no delete tool). ChatGPT explains it can add, update and complete tasks but not delete them, and that deleting is done in the Cleartable app.

**2. Unrelated request**
- Scenario: the user asks something Cleartable has nothing to do with.
- Prompt: "What's the weather in Prague tomorrow?"
- Expected: no Cleartable tool is called. ChatGPT answers normally, without involving Cleartable.

**3. Ambiguous request that needs clarification**
- Scenario: more than one task matches what the user said.
- Setup: the account has two tasks containing "report" ("Write Q4 report" and "Read board report", both in the Work project).
- Prompt: "Mark the report task as done."
- Tools: `list_tasks` (search "report"), no `complete_task` yet
- Expected: ChatGPT asks which of the two tasks the user means and completes nothing until the user answers.

## Review account state (set up 2026-11-01)

review@cleartable.app (user 11, free plan, 25 AI actions a day) has:
- Projects: Work, Kitchen renovation
- Due today: Write Q4 report, Send Anna the Q4 budget draft, Book car service
- Also open: Read board report (Nov 3), Prepare slides for Friday review (Nov 6), two kitchen tasks, two inbox items, one waiting-for, one someday
- Habit: Meditate daily

Dates are fixed, so if you record on a later day, ask Claude to move the "due today" tasks to that day first. Case 4 depends on case 1 (it completes the dentist task case 1 creates), so run them in order.
