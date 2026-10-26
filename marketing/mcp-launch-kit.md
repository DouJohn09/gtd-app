# Cleartable AI-apps launch kit

Everything needed to list Cleartable's MCP server in directories and to post about it.
Copy from here; adjust the voice where it doesn't sound like you.

---

## 1. Directory listings: who does what

| Directory | Reach | What it needs | Who |
|---|---|---|---|
| **Official MCP Registry** (registry.modelcontextprotocol.io) | Feeds many other directories and clients automatically | `marketing/server.json` + domain proof (already live after deploy) | Claude can publish with the CLI once you say go |
| **Smithery** (smithery.ai/new) | Big MCP marketplace | Account, paste `https://cleartable.app/mcp`, sign in once so it can read the tools | You (needs your account) |
| **PulseMCP** (pulsemcp.com/submit) | Popular MCP news + directory | Submit form: URL + short description | You |
| **mcp.so** (mcp.so/submit) | Large community list | Submit form or GitHub issue | You |
| **Glama** (glama.ai/mcp/servers) | Curated, does quality checks | "Add server" form for remote servers | You |
| **Claude Connectors Directory** (claude.ai/directory/manage) | Shown inside Claude to every user | Paid Claude plan, listing copy below, icon, reviewer test account | You (Claude prepares everything) |
| **ChatGPT app directory** (platform.openai.com → Apps) | Shown inside ChatGPT | Verified developer org, reviewer test account, review | You, later |

**Reviewer test account (Claude and ChatGPT directories).** Set on Railway:
`REVIEW_LOGIN=review@cleartable.app:<six digits you choose>`
That address then signs in with that fixed code and no email is sent. Sign in once yourself, add a few sample tasks, a project and a habit so reviewers see a populated account. Reviewer instructions to paste:

> Open https://cleartable.app/app, choose "Continue with email", enter review@cleartable.app and the code ______. To connect: add https://cleartable.app/mcp as a custom connector, sign in with the same email and code when Cleartable asks, and press Allow.

---

## 2. Listing copy (reuse everywhere)

**Name:** Cleartable

**Server address:** `https://cleartable.app/mcp` (Streamable HTTP, OAuth 2.1 with dynamic registration or client metadata documents)

**One-liner (≤100 chars):**
Add, read and plan tasks in Cleartable, a calm AI task manager with calendar and habits.

**Tagline (≤200 chars):**
Say "put this in Cleartable" in any chat. Tasks land sorted in your inbox, and one tap plans them into your calendar. Your assistant can add, read, update and complete tasks, never delete.

**Description (≤2000 chars):**
Cleartable is a calm, AI-powered app for tasks, habits and calendar. This connector lets your AI assistant work with your Cleartable account.

Talk a messy week through in a chat, then say "put this in Cleartable". A whole paragraph is split into separate tasks and sorted the same way as anything you capture in the app: the right list and context, dates read from plain language, a sensible time estimate. Back in Cleartable, Plan my day or Plan my week places them into free time around your Google Calendar.

It works the other way too: ask "what's on today?" and the assistant reads your tasks, calendar events and habits for the day, so you can decide what to do first, reschedule something or tick off what you just finished.

What the assistant can do:
- Capture tasks from free text (one or many at once)
- Add a single task with list, date, deadline, time, context, project or priority
- List tasks: today, upcoming, by list, completed, or by search
- Update a task, or mark it done
- List projects and read today's overview

What it can't do: delete anything, or touch your account or billing. You approve the connection on a Cleartable page that lists exactly this, and you can disconnect any app in Settings → AI apps.

Works on Cleartable's free plan. Tasks sent through Cleartable's AI sorting count toward the normal daily AI allowance.

**Categories:** Productivity · Task management · Calendar
**Tags:** tasks, to-do, productivity, planning, calendar, habits, GTD

**Tools:**
| Tool | Read/write | What it does |
|---|---|---|
| capture_tasks | write | Free text → one or more sorted tasks |
| add_task | write | One task with explicit fields |
| list_tasks | read | Today / upcoming / list / completed / search |
| update_task | write (idempotent) | Change title, list, dates, deadline, notes… |
| complete_task | write | Mark a task done |
| list_projects | read | Active projects |
| get_today | read | Today's tasks, events and habits |

**Links**
- Website: https://cleartable.app
- Documentation: https://cleartable.app/blog/add-tasks-from-chatgpt-claude-grok
- Privacy policy: https://cleartable.app/privacy.html
- Terms: https://cleartable.app/terms.html
- Support: support@cleartable.app
- Icon: `client/public/icons/icon-512.png` (512×512 PNG)

**Example prompts (Claude's portal asks for use cases):**
1. "Put these in Cleartable: book the car service, buy a gift for Mia's party on Saturday, and plan the hike with Tom."
2. "What's on my plate today in Cleartable, and what should I do first?"
3. "Add the action items from this conversation to Cleartable."
4. "Mark the dentist call done and move the Q4 deck to tomorrow."

---

## 3. Post drafts

Ground rules: post from your own account, one community per day, stay in the thread for the first two hours and answer every comment. Check each subreddit's rules before posting; some only allow self-promotion in a weekly thread. Never post the same text twice.

### Show HN

**Title:** Show HN: Cleartable – a task manager your AI assistant can write to (MCP)

**Text:**
Hi HN, I'm Jan. I build Cleartable on my own: a calm task manager with tasks, habits and calendar in one place, where AI does the sorting.

The newest part is a remote MCP server. You add https://cleartable.app/mcp to Claude, ChatGPT or Grok once, and then "put this in Cleartable" in any chat creates real tasks. A whole paragraph gets split into separate tasks, each sorted into a list with a context, a date and an estimate. "Plan my week" in the app then places them into free time around your Google Calendar.

Some details that might interest people here:
- Stateless Streamable HTTP on Express, one McpServer per request, so any instance can answer.
- Own OAuth 2.1 server: dynamic client registration and client ID metadata documents, PKCE, single-use codes, rotating refresh tokens stored as hashes.
- Seven tools, deliberately no delete. Read tools are marked read-only, so clients can skip confirmations for them.
- The sorting is one model call that returns 1–8 tasks; it was evaluated on a fixed set before switching models.

Free to try, no card: https://cleartable.app. I'd love feedback on the connector, and on whether the MCP tool design makes sense from the assistant's side.

### r/ClaudeAI

**Title:** I made a connector so Claude can add tasks to my to-do app (and plan my week)

**Text:**
I kept ending planning chats with Claude holding a list of to-dos I then had to copy by hand. So I built a remote MCP server for my task app, Cleartable.

Add `https://cleartable.app/mcp` as a custom connector (works on the free Claude plan; you get one custom connector there), sign in, press Allow. Then:
- "Put these in Cleartable: …" → separate tasks, each sorted with a list, context, date and estimate
- "What's on today?" → Claude reads tasks, calendar events and habits
- "Mark X done, move Y to tomorrow" → done

It can't delete anything. Free plan on my side too. Happy to answer questions about how it works, and keen on feedback on the tool design.

### r/ChatGPT

**Title:** You can now say "put this in Cleartable" in ChatGPT and the tasks show up sorted

**Text:**
If you plan things in ChatGPT, you probably copy the to-dos somewhere afterwards. I built a connector for my task app so ChatGPT can add them directly.

Setup (needs Plus or higher, web): Settings → Apps → Advanced settings → Developer mode, then Create app with `https://cleartable.app/mcp`, sign in, Allow. I tested adding tasks on a Plus account.

After that: "Put these in Cleartable: …" creates separate tasks, already sorted. ChatGPT asks you to confirm each change, which is normal. It can read your day and complete tasks, never delete. Free to try: https://cleartable.app

### r/productivity (check the self-promotion rule first)

**Title:** I stopped copying to-dos out of AI chats; here's the setup

**Text:**
A lot of my planning happens in conversations with an AI assistant now, and the weak spot was always the hand-off: the to-dos stayed in the chat. What fixed it for me was connecting the assistant straight to my task list, so "put this in my list" actually does it, and the list then gets planned into my calendar.

I built this into my own app (Cleartable, free plan available, disclosure: I'm the developer), but the idea works with any task tool that has an MCP connector. The habits that made it stick:
1. End every planning chat with "add the action items".
2. Let the app sort and estimate; only fix what's wrong.
3. Plan the week once, in the app, not in the chat.

Curious whether others hand tasks over from AI assistants, and how.

### r/gtd

**Title:** Capturing into my GTD inbox straight from an AI chat

**Text:**
Capture is the step I lose most often when I think out loud with an AI assistant: the open loops end up in a chat log instead of my inbox. I added an MCP connector to the GTD-based app I build (Cleartable; I'm the developer), so "put this in my inbox" from Claude or ChatGPT creates real inbox items. Clarifying still happens in the app, with AI suggesting the list, context and next action.

Question for the group: do you let AI suggest clarifying decisions (next action vs waiting for vs someday), or do you keep that strictly manual?

### X / Bluesky thread

1. Your AI assistant is where you plan. Your to-do app is where things get done. Now they talk: say "put this in Cleartable" in ChatGPT, Claude or Grok. 🧵 [attach screen recording of the landing loop]
2. One paragraph becomes separate tasks, each sorted: list, context, date, time estimate.
3. Then "Plan my week" puts them into free time around your Google Calendar.
4. Ask "what's on today?" and the assistant reads your tasks, events and habits.
5. It can add, read, update and complete. It can never delete.
6. Free to try: https://cleartable.app · setup: https://cleartable.app/blog/add-tasks-from-chatgpt-claude-grok

### Product Hunt (a week later)

- **Name:** Cleartable
- **Tagline (≤60):** The calm task app your AI assistant can write to
- **Description (≤260):** Capture anything, and AI sorts it and plans your day around your calendar. Now with ChatGPT, Claude and Grok: say "put this in Cleartable" in any chat and the tasks land sorted. Tasks, habits and calendar in one calm place.
- **First comment:** the Show HN text, shortened, plus one honest line on what's next.
- **Gallery:** landing loop recording, AI apps loop recording, calendar week view, Plan my week board, the Connect page.
