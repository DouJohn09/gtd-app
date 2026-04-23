# GTD Flow — Project Knowledge

## Overview
GTD Flow is a productivity app implementing the Getting Things Done (GTD) methodology by David Allen. It features AI-powered task management, habit tracking, and a modern responsive UI with dark mode.

**Deployed on:** Railway (auto-deploy from GitHub `main` branch)
**Repository:** https://github.com/DouJohn09/gtd-app

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 18 + Vite 5 + Tailwind CSS   |
| Backend    | Express 4 (Node.js, ES Modules)     |
| Database   | sql.js (SQLite in-memory, persisted to file) |
| AI         | OpenAI GPT-4o / GPT-4o-mini (JSON response format) |
| Auth       | Google OAuth 2.0 + JWT              |
| Deployment | Railway                             |

- ES Modules throughout (`"type": "module"`)
- Tailwind `darkMode: 'class'` — currently locked to dark via boot script in `index.html`; `useTheme` is a no-op (light mode planned)
- Design system: **Instrument Serif** (display) + **Geist Mono** (data) + **Satoshi** (body) via Fontshare; semantic CSS variables (`--violet`, `--mint`, `--amber`, `--rose` as RGB triplets); custom `.glass` / `.gtd-*` classes in `index.css`
- Client-side sorting with `useMemo` for performance

---

## Project Structure

```
gtd-app/
├── package.json              # Root: postinstall, build, start scripts
├── railway.json              # Railway deployment config
├── client/
│   └── src/
│       ├── App.jsx           # Routes
│       ├── index.css          # Design tokens (RGB CSS vars), .glass/.gtd-* classes
│       ├── components/
│       │   ├── Layout.jsx     # 248px sidebar with grouped nav, ⌘K capture, mobile bottom-tabs
│       │   ├── AuroraBackground.jsx  # Fixed radial-gradient mesh + grain (z-0)
│       │   ├── CommandCapture.jsx    # Global ⌘K quick-capture modal
│       │   ├── QuickCapture.jsx
│       │   ├── TaskCard.jsx
│       │   ├── TaskModal.jsx
│       │   ├── SortDropdown.jsx  # Reusable sort dropdown + sortTasks() utility
│       │   ├── CalendarTaskCard.jsx   # Compact draggable task card for calendar views
│       │   ├── CalendarEventCard.jsx  # Google Calendar event card (read-only, indigo)
│       │   ├── calendar/
│       │   │   ├── MonthView.jsx
│       │   │   ├── WeekView.jsx
│       │   │   ├── DayView.jsx
│       │   │   └── UnscheduledSidebar.jsx
│       │   ├── ui/                   # Design-system primitives
│       │   │   ├── GlassCard.jsx     # Frosted glass surface
│       │   │   ├── MonoLabel.jsx     # Geist Mono uppercase eyebrow
│       │   │   ├── Chip.jsx          # Tonal pill (mint/amber/rose/violet/neutral)
│       │   │   ├── FreshCheck.jsx    # Animated checkbox with optimistic UI
│       │   │   └── SectionHeader.jsx
│       │   ├── HabitCard.jsx
│       │   ├── HabitModal.jsx
│       │   └── Toast.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Inbox.jsx
│       │   ├── Lists.jsx          # Next Actions, Waiting For, Someday/Maybe
│       │   ├── Projects.jsx
│       │   ├── CompletedTasks.jsx  # Task history with restore/delete
│       │   ├── Habits.jsx
│       │   ├── AIAssistant.jsx    # All AI features UI
│       │   ├── WeeklyReview.jsx   # 4-step review wizard
│       │   ├── Calendar.jsx      # Month/week/day calendar with Google Calendar sync
│       │   └── Login.jsx
│       ├── contexts/
│       │   └── AuthContext.jsx    # Google OAuth + JWT
│       ├── hooks/
│       │   ├── useApi.js
│       │   └── useTheme.js        # Dark mode hook
│       └── lib/
│           ├── api.js             # API client with namespaces
│           └── dateUtils.js       # Calendar date helpers (formatDateKey, getMonthDays, etc.)
└── server/
    └── src/
        ├── index.js               # Express server entry
        ├── db/
        │   ├── schema.js          # SQLite schema + migrations
        │   └── models.js          # Data access layer
        ├── middleware/
        │   └── auth.js            # JWT auth middleware
        ├── env.js                 # Dotenv config with explicit path
        ├── routes/
        │   ├── tasks.js
        │   ├── projects.js
        │   ├── contexts.js
        │   ├── habits.js
        │   ├── auth.js            # Login + Google Calendar auth
        │   └── ai.js              # All AI endpoints
        └── services/
            ├── ai.js              # OpenAI integration
            └── googleCalendar.js  # Google Calendar token management & event fetching
```

---

## Database Schema

### Tables
- **users** — `id`, `google_id`, `email`, `name`, `picture`, `google_calendar_access_token`, `google_calendar_refresh_token`, `google_calendar_token_expiry`, `created_at`, `last_login`
- **tasks** — `id`, `title`, `notes`, `list` (inbox|next_actions|waiting_for|someday_maybe|completed), `context`, `project_id`, `waiting_for_person`, `due_date`, `start_date`, `energy_level` (low|medium|high), `time_estimate`, `priority`, `is_daily_focus`, `position`, `completed_at`, `recurrence_rule` (daily|weekdays|weekly|monthly|yearly|custom), `recurrence_interval`, `recurrence_days`, `recurrence_type` (absolute|relative), `user_id`, `created_at`, `updated_at`
- **projects** — `id`, `name`, `description`, `status` (active|completed|on_hold), `outcome`, `execution_mode` (parallel|sequential), `user_id`, `created_at`, `updated_at`
- **weekly_reviews** — `id`, `user_id`, `completed_at`, `inbox_count_at_start`, `tasks_completed`, `tasks_moved`, `tasks_deleted`, `ai_summary`, `created_at`
- **contexts** — `id`, `name`, `user_id`, `created_at`
- **habits** — `id`, `name`, `description`, `frequency` (daily|weekly|specific_days), `target_days`, `category`, `color`, `user_id`, `active`, `created_at`
- **habit_logs** — `id`, `habit_id`, `completed_date`, `user_id`, `created_at`

---

## Features

### Core GTD
- **Inbox** — Quick capture with instant task creation
- **Next Actions** — Actionable tasks grouped by context (when sorted by priority)
- **Waiting For** — Delegated items
- **Someday/Maybe** — Future ideas
- **Projects** — Multi-task outcomes with sequential or parallel execution modes, drag-to-reorder tasks
- **Weekly Review** — Guided 4-step wizard (Get Clear → Get Current → Get Creative → Complete) with AI insights, streak tracking, and bulk task actions

### Task Management
- Sorting across all list views (priority, date added, due date, energy, time estimate, alphabetical)
- Completed tasks history with restore-to-inbox and permanent delete
- Custom user-defined contexts (e.g., @home, @office, @errands)
- Energy levels and time estimates on tasks
- Due dates with priority scoring
- **Recurring tasks** — Daily, weekdays, weekly, monthly, yearly, custom (specific days + interval). Absolute (advance from due date) or relative (advance from completion date) recurrence. On completion, creates a completed snapshot for history and advances the original task's dates.
- **Start/defer dates** — Tasks with a future `start_date` are hidden from active lists (Next Actions, Waiting For, etc.) until the start date arrives. Deferred toggle chip on each list view reveals hidden tasks at reduced opacity for quick editing.
- **Clickable URL previews** — URLs in task notes render as interactive hostname badges in TaskCard and TaskModal

### AI Features (OpenAI)
- **Smart Capture** (GPT-4o-mini) — Real-time AI on every Quick Capture: auto-categorizes list, context, priority, energy, time estimate; extracts due dates and start dates from natural language ("call mom tomorrow", "starting next week"); detects waiting-for patterns; sets daily focus for urgent/today tasks only; auto-matches tasks to existing projects by name/topic; detects personal vs work tasks for context assignment (@work, @home, @phone, etc.); detects recurrence patterns ("every Monday", "daily"). Toggle on/off with sparkle icon.
- **Process Inbox** (GPT-4o) — AI analyzes inbox tasks, suggests which list each belongs to, assigns priority/energy/time
- **Daily Focus** (GPT-4o) — AI picks top priorities for today based on energy, deadlines, importance
- **Find Duplicates** (GPT-4o) — AI scans all active tasks for duplicates, suggests which to keep/remove
- **Import Notes** (GPT-4o) — Paste bulk text from other apps, AI categorizes each item into GTD lists
- **Weekly Review Analysis** (GPT-4o) — AI evaluates system health (1-10 score), identifies stale items, flags projects needing attention, suggests follow-ups on waiting-for items, provides actionable recommendations

### Calendar
- **Calendar view** — Month/week/day grids with tasks by due date and start date, unscheduled sidebar, drag-and-drop scheduling
- **Google Calendar sync** — Opt-in OAuth connection, reads events and displays alongside tasks with indigo styling, read-only (not draggable), click to open in Google Calendar

### Project Execution Modes
- **Parallel** (default) — All project tasks visible in Next Actions simultaneously
- **Sequential** — Only the first uncompleted task is visible; completing/deleting auto-promotes the next task
- Tasks within sequential projects can be reordered with up/down arrows
- Mode can be toggled on existing projects (auto-assigns positions when switching to sequential)

### Other
- **Habit Tracking** — Daily/weekly habits with streak tracking, calendar view, past-date logging, default categories (Health, Fitness, Mindfulness, etc.), suggested habits quick-add, case-insensitive category deduplication
- **Neo-modern glass UI** — Aurora gradient background, frosted glass cards, semantic color tones per GTD list (inbox→amber, next→mint, waiting→rose, someday→violet); Instrument Serif display headings, Geist Mono labels; ⌘K global capture
- **Dark mode (locked)** — Aesthetic is dark-only at present; CSS-variable design tokens are architected so a future light theme is a single `:root:not(.dark)` override
- **Responsive Design** — Sidebar on desktop, bottom-tab nav on mobile
- **Google OAuth** — Secure login, multi-user support

---

## API Endpoints

### Tasks: `/api/tasks`
- `GET /` — Get all tasks (optional `?list=` filter; excludes deferred tasks)
- `GET /deferred?list=` — Get deferred tasks (start_date > today) for a given list
- `POST /` — Create task
- `PUT /:id` — Update task
- `PUT /:id/complete` — Mark complete (recurring tasks auto-advance dates)
- `DELETE /:id` — Delete task

### Projects: `/api/projects`
- `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`
- `POST /:id/breakdown` — AI project breakdown into tasks
- `POST /:id/apply-breakdown` — Apply AI-suggested tasks
- `POST /:id/reorder` — Reorder tasks within project (`{ taskIds: [...] }`)

### Contexts: `/api/contexts`
- `GET /`, `POST /`, `DELETE /:id`

### Habits: `/api/habits`
- `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`
- `POST /:id/toggle` — Toggle habit completion (optional `{ date }` for past-date logging)
- `GET /stats` — Streak and completion stats

### AI: `/api/ai`
- `POST /smart-capture` — AI-powered task capture with NLP date parsing and auto-categorization
- `POST /process-inbox` — AI inbox processing
- `POST /apply-inbox-processing` — Apply AI inbox suggestions
- `POST /daily-priorities` — AI daily priorities
- `POST /apply-daily-focus` — Apply daily focus selection
- `POST /import-notes` — AI note categorization
- `POST /apply-import` — Apply imported notes
- `POST /find-duplicates` — AI duplicate detection
- `POST /apply-duplicates` — Remove selected duplicates
- `POST /weekly-review` — Full system analysis with AI insights
- `POST /complete-review` — Apply review changes and record completion

### Auth: `/api/auth`
- `POST /google` — Google OAuth login
- `GET /me` — Get current user (includes `google_calendar_connected`)
- `GET /google-calendar/status` — Calendar connection status
- `POST /google-calendar` — Connect Google Calendar (exchange auth code for tokens)
- `DELETE /google-calendar` — Disconnect Google Calendar (revoke + clear tokens)
- `GET /config` — Get Google Client ID

---

## Competitive Landscape

### Dedicated GTD Apps
| App | Platform | Price | Strengths | Weaknesses |
|-----|----------|-------|-----------|------------|
| **OmniFocus 4** | Apple only | $9.99/mo | Deepest GTD features, review mode | No web/Android, steep learning curve |
| **FacileThings** | Web | ~$8-12/mo | Most faithful GTD workflow | Dated UI, slow, too many clicks |
| **Nirvana** | Web | Free / $39/yr Pro | Budget-friendly, solid GTD lists | No review mode, minimal UI |
| **SingleFocus** | Web | - | Cross-platform, ML focus suggestions | Newer, less proven |

### General Task Managers Used for GTD
| App | Platform | Price | Strengths | Weaknesses |
|-----|----------|-------|-----------|------------|
| **Things 3** | Apple only | ~$80 one-time | Best UI, no subscription | Apple-only, no collaboration |
| **Todoist** | All platforms | Free / $5/mo Pro | Best cross-platform, integrations | No defer dates, no review mode |
| **TickTick** | All platforms | Free / $36/yr | Pomodoro, habits, Eisenhower matrix | Weak GTD fit |

### GTD Flow Differentiators
- **Web-based & cross-platform** (unlike OmniFocus, Things)
- **AI-powered features** (smart capture, inbox processing, duplicate detection, daily focus, weekly review analysis — most competitors don't have this)
- **Weekly Review workflow** (only OmniFocus and FacileThings have this — our version adds AI insights)
- **Sequential/parallel projects** (like OmniFocus, unlike most competitors)
- **Recurring tasks with absolute + relative recurrence** (matches OmniFocus flexibility)
- **Start/defer dates with deferred toggle** (like OmniFocus defer dates, with easy toggle to reveal hidden tasks)
- **Built-in habit tracking** (only TickTick does this among competitors)
- **Modern UI with dark mode** (FacileThings and Nirvana feel dated)
- **Energy levels & time estimates** on tasks
- **Natural language smart capture** with AI auto-categorization (unique — no competitor does this with GPT)

### Potential Future Features (Prioritized by User Demand)

Based on community research across Reddit (r/productivity, r/todoist, r/gtd, r/ticktick, r/omnifocus — 3.7M+ combined members), Facebook groups, review sites, and market analyses (April 2026). Full report: `FEATURE_RESEARCH_2026.md`

#### High Priority (most requested across all communities)
1. ~~**Start/defer dates**~~ — ✅ Shipped. Tasks hidden until start_date, deferred toggle chip on lists.
2. **Calendar integration & time blocking** — Phase 1-2 shipped (calendar view + Google Calendar sync). Phase 3-4 (time blocking + AI scheduling) remaining.
3. ~~**Recurring tasks**~~ — ✅ Shipped. Daily/weekdays/weekly/monthly/yearly/custom, absolute + relative recurrence.
4. ~~**Natural language input**~~ — ✅ Shipped as Smart Capture (GPT-4o-mini).
5. **PWA / offline support** — Installable web app with offline capability; addresses mobile + offline without native apps

#### Medium Priority (strong differentiators)
6. **Built-in Pomodoro / focus timer** — Low effort, high perceived value
7. **Saved filters / custom views** — Perspectives like "high-energy @office tasks due this week"
8. **Productivity analytics dashboard** — Completion rates, streaks, time trends, project velocity
9. **Task dependencies (cross-project)** — "Task B blocked by Task A" beyond sequential projects
10. **Collaboration & shared lists** — Shared projects, task assignment, family/team use

#### Lower Priority (emerging trends)
11. **Voice-first task capture** — Speak to create organized tasks
12. **Integrated notes & journaling** — Rich notes alongside tasks
13. **Gamification** — XP, streaks, rewards for task completion (beyond habit streaks)
14. **ADHD-friendly design** — Minimal clutter, visual timers, gentle nudges
15. **Self-hosted / privacy-first option** — Local-only data, no cloud dependency

### Calendar Integration — Implementation Roadmap

The #1 most requested feature ecosystem-wide. Users describe 4 levels of sophistication:

**Phase 1 — Calendar view of tasks:**
- Day/week/month calendar grid showing tasks by due date
- Unscheduled tasks in a sidebar panel
- Drag tasks to assign/change due dates visually

**Phase 2 — Google Calendar sync:**
- One-click Google Calendar connection (reuse existing Google OAuth)
- Read calendar events and display alongside tasks
- Users see busy/free time at a glance during daily planning

**Phase 3 — Time blocking:**
- Drag tasks from sidebar onto specific time slots
- Tasks get `scheduled_time` + `duration` (leverage existing `time_estimate` field)
- Time blocks optionally pushed to Google Calendar

**Phase 4 (optional) — AI-assisted scheduling:**
- Extend Daily Focus AI to suggest time slots based on energy levels, time estimates, and calendar availability
- User confirms/adjusts, not fully automatic

**Key user insight:** Users do NOT want a calendar replacement — they want their task app to integrate with Google Calendar. The unscheduled task list must coexist with the calendar view. One-click setup is critical.

**Competitor reference:** TickTick has the best built-in calendar; Todoist's is considered "half-baked"; Sunsama has the best UX but costs $16/mo; Things 3 and OmniFocus lack time blocking entirely.

### Key User Behavior Insights

- **#1 deal-breaker for switching:** Price hikes (Todoist's $48→$60/yr increase caused mass migration discussions)
- **#1 technical deal-breaker:** Buggy sync / unreliable cross-device experience
- **The "three-app problem":** Users hate juggling separate apps for tasks + notes + calendar
- **AI skepticism:** Users want AI that "reduces friction, not reinvents processes" — many see AI task breakdown as "a way to procrastinate"
- **Backlog anxiety:** Accumulating overdue tasks creates "a mountain of shame" that makes users avoid opening the app
- **GTD is underserved:** Despite being a 25-year-old methodology, most modern task managers treat GTD as an afterthought — clear gap for native GTD support
- **ADHD community (r/ADHD, 1.5M members):** One of the richest sources for UX feedback; apps designed for ADHD users tend to work better for everyone
- **Subscription fatigue is rising:** One-time purchases (Things 3) and open-source tools gaining appeal

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `DATABASE_PATH` | SQLite database file path (default: `server/gtd.db`) |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (production on Railway) |

---

## Development

```bash
# Install all dependencies (client + server)
npm install

# Run server (serves API + built client)
npm start

# Build client
npm run build

# Dev: run client and server separately
cd client && npm run dev    # Vite dev server on :5173
cd server && npm start      # Express on :3000
```

---

## Go-to-Market Strategy

### Positioning — Own the "Modern GTD" Niche

Don't compete with Todoist/TickTick on general task management. Position as **the GTD app for people who actually do GTD** — with a modern stack and AI:

- **vs OmniFocus**: Cross-platform, AI-powered, lower price
- **vs FacileThings**: Modern UI, faster, AI features
- **vs Nirvana**: Active development, habits, weekly review, AI
- **vs Todoist/TickTick**: Native GTD workflow instead of GTD-as-afterthought

Unique combination (AI inbox processing + weekly review + habit tracking + sequential projects + calendar sync) doesn't exist anywhere else.

### Must-Ship Before Launch

Two deal-breakers for GTD practitioners — **both shipped:**

1. ~~**Recurring tasks**~~ — Daily/weekdays/weekly/monthly/yearly/custom with absolute or relative recurrence. **Done.**
2. ~~**Start/defer dates**~~ — Tasks hidden until start date, toggle chip to reveal deferred tasks on each list. **Done.**

### Launch Sequence

| Phase | Channel | Angle |
|-------|---------|-------|
| Week 1-2 | r/gtd (80K) | Soft launch. "I built a GTD app because FacileThings felt dated and OmniFocus doesn't work on my PC" — authentic, problem-first |
| Week 3 | r/productivity (3.7M) + r/ProductivityApps (30K) | Lead with AI features + calendar |
| Week 4 | Product Hunt | "AI-powered GTD app" — strong PH category |
| Week 5+ | Hacker News "Show HN" | Technical story: solo dev, open stack |

### Pricing Strategy

Given subscription fatigue and Todoist's backlash ($48 → $60/yr):

| Tier | Price | What |
|------|-------|------|
| Free | $0 | Core GTD (inbox, lists, projects, contexts) |
| Pro | $3/mo or $30/yr | AI features, calendar sync, habits, analytics |
| Lifetime | $80 one-time | Everything forever (limited-time launch offer) |

Lifetime deals generate upfront cash and launch communities love them. Things 3 proved this model works.

### Pre-Launch Infrastructure

- **Migrate off sql.js** — In-memory SQLite is fragile for production. A crash or Railway restart risks data loss. Move to PostgreSQL or SQLite on persistent storage before taking money.
- **Add PWA support** — Installable web app, works on mobile. Low effort, eliminates "no mobile app" objection without native apps.

### Growth Channels (No Budget)

- **Reddit organic posts** — Genuine participation in r/gtd, r/productivity, r/ADHD, r/ProductivityApps
- **"Built with AI" directories** — Several curate AI-powered tools
- **GTD blog content** — "How to do a weekly review" type posts that rank on Google and funnel to the app
- **Template/workflow sharing** — Let users export and share their GTD setups

### What NOT to Do

- Don't build collaboration features yet — solo GTD users are the beachhead
- Don't build native mobile apps — PWA first, native only with revenue
- Don't compete on AI hype — position AI as "reduces friction" not "does everything for you"
- Don't launch free-only — need signal on willingness to pay early

### Priority Order

1. ~~Ship recurring tasks + start dates (table stakes)~~ **Done**
2. Migrate off sql.js to real persistent DB
3. Add PWA support
4. Soft launch on r/gtd with free tier + $30/yr Pro
5. Expand to r/productivity + Product Hunt
6. Iterate based on feedback

---

## Commit History (feature evolution)
1. Initial commit: core GTD app
2. Google OAuth + Railway deployment
3. Custom user contexts
4. Habit tracking
5. Mobile responsive design
6. Bulk notes import with AI
7. Dark mode
8. AI duplicate task detection
9. Completed tasks history
10. Task sorting across all views
11. Sequential/parallel project execution modes
12. Habit improvements (past-date logging, default categories, suggested habits, category normalization)
13. Text overflow fix in task cards
14. Weekly Review workflow (4-step wizard with AI analysis)
15. Calendar view with month/week/day views and drag-and-drop scheduling
16. Google Calendar sync with opt-in OAuth connection
17. AI Smart Capture with natural language date parsing and auto-categorization
18. Smart Capture: project matching and personal/work context detection
19. Fix task detail access from Today's Focus and Projects views
20. Fix daily focus rule — only flag tasks due today, not tomorrow
21. Redesign client with neo-modern glass aesthetic (dark-locked, design-token system, ⌘K capture, glass primitives)
22. Inbox 2-column layout (processing stats + clarify ritual + AI assist sidebar); widen Lists/WeeklyReview/CompletedTasks
23. AI quality pass: confidence levels in prompts, hide low-confidence badges, inline editor on Import Notes + Process Inbox cards, per-item prune on Daily Focus suggestions
24. Sort persistence, project fix in Today modal, Today screen refresh on capture, URL link previews, GTD flow summaries
25. Recurring tasks (daily/weekdays/weekly/monthly/yearly/custom, absolute/relative), start/defer dates, deferred task toggle on list views

---

## AI Quality Workstream

Cross-cutting effort to make AI suggestions more trustworthy. Insight from FEATURE_RESEARCH_2026.md: users abandon AI features after a single bad suggestion, so the goal is not "more AI" but "AI that is honest about what it doesn't know."

### Shipped
- **Confidence levels in every AI prompt** — `processInbox`, `importNotes`, `getDailyPriorities` now return `confidence: high|medium|low` per inferred field. Prompts include explicit rules ("prefer null + low over speculation") and warn against cross-item bleed (don't infer item N's project from item N-1).
- **Confidence-aware rendering** — Import Notes and Process Inbox cards hide low-confidence badges entirely and fade medium ones; high-confidence shows normally. Daily Focus shows a per-item confidence chip.
- **Inline-edit-everywhere on AI surfaces** — Import Notes and Process Inbox cards have a pencil → full editor (title, list, context, project, due date, energy, time, waiting-on, daily focus). User can fix wrong suggestions in place instead of hunting them down later.
- **Per-item prune on Daily Focus** — Each suggestion has a remove (X) toggle; "Set N as Today's Focus" only applies the kept ones.
- **Backend wired** — `/apply-inbox-processing` accepts the full editable field set (project_id, due_date, energy, time, daily_focus, waiting_for_person), mirroring `/apply-import`.

### Next (in priority order)
1. **Few-shot prompting from user history** — Inject 5–10 of the user's recent processed tasks into prompts so AI learns their personal patterns (work vs home keywords, project naming, etc.). Should reduce wrong context/project guesses dramatically.
2. **Capture corrections** — When the user edits an AI suggestion before applying, log the original→corrected diff. Use as future few-shot examples and as a quality metric.
3. **Single-item processing for Process Inbox** — Send each inbox item in its own API call rather than a batch. Eliminates the cross-item bleed problem at the API level (batching was the root cause of the "Courier Hub assigned to unrelated tasks" bug).
4. **Show "AI uncertain" affordance** — When AI returns mostly low confidence for an item, surface a hint ("AI wasn't sure about project + context") instead of silently hiding badges, so the user knows to check the editor.
5. **Confidence calibration check** — Track how often "high" suggestions get edited vs "low" ones. If high gets edited often, the prompt is overconfident — tune.

---

## Build Backlog (Prioritized)

Features to build, ordered by impact and launch-readiness.

### P0 — Must-ship before public launch
| # | Feature | Why | Effort | Status |
|---|---------|-----|--------|--------|
| 1 | **Recurring tasks** | Table stakes — every competitor has it. Users can't manage real workflows without it. | Medium | **Shipped** |
| 2 | **Start/defer dates** | #1 GTD-specific request. Hide tasks until actionable. Core GTD philosophy. | Medium | **Shipped** |
| 3 | **Migrate off sql.js** | In-memory SQLite is fragile. A crash or Railway restart = data loss. Can't take money on this. | High | |

### P1 — High impact, build before or shortly after launch
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 4 | **PWA support** | Installable on mobile without native apps. Eliminates "no mobile app" objection. | Low |
| 5 | **Calendar time blocking (Phase 3)** | Drag tasks onto time slots. Add `scheduled_time` + `duration` fields. Push blocks to Google Calendar. | High |
| 6 | **AI-assisted scheduling (Phase 4)** | Smart capture reads your Google Calendar, suggests optimal time slots for new tasks based on free time + energy levels. | Medium |
| 7 | **Saved filters / custom views** | Power user perspectives: "high-energy @office tasks due this week". OmniFocus killer feature. | Medium |
| 8 | **Productivity analytics dashboard** | Completion rates, streaks, time trends, project velocity. Users want to see progress. | Medium |

### P2 — Differentiators, build when core is solid
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 9 | **Built-in Pomodoro timer** | Low effort, high perceived value. TickTick's is "oddly effective." | Low |
| 10 | **Recurring task flexibility** | Beyond current recurrence: "every 3rd weekday", "2 days after completion" (relative recurrence shipped, advanced patterns remaining). | Medium |
| 11 | **Task dependencies (cross-project)** | "Task B blocked by Task A" beyond sequential projects. | Medium |
| 12 | **Free AI provider backend** | Swap to Gemini/Groq for free-tier users to eliminate API costs at scale. | Medium |

### P3 — Future / after product-market fit
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 13 | **Collaboration & shared lists** | Couples, families, small teams. Different market — build only with clear demand. | High |
| 14 | **Voice-first task capture** | Speech → organized tasks. Growing trend but niche. | Medium |
| 15 | **Integrated notes & journaling** | Rich notes alongside tasks. Notion territory. | High |
| 16 | **Gamification** | XP, rewards, streaks for tasks. Risky if poorly designed. | Medium |
| 17 | **ADHD-friendly design** | Visual timers, low-overwhelm UI, gentle nudges. Great niche but needs research. | Medium |
| 18 | **Self-hosted / privacy-first** | Local-only data, no cloud. Growing demand from r/selfhosted. | High |
