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
| AI         | OpenAI GPT-4o (JSON response format) |
| Auth       | Google OAuth 2.0 + JWT              |
| Deployment | Railway                             |

- ES Modules throughout (`"type": "module"`)
- Tailwind `darkMode: 'class'` strategy with `useTheme` hook
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
│       ├── index.css          # Tailwind + custom dark mode classes
│       ├── components/
│       │   ├── Layout.jsx     # Sidebar nav, dark mode toggle, mobile responsive
│       │   ├── QuickCapture.jsx
│       │   ├── TaskCard.jsx
│       │   ├── TaskModal.jsx
│       │   ├── SortDropdown.jsx  # Reusable sort dropdown + sortTasks() utility
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
│       │   └── Login.jsx
│       ├── contexts/
│       │   └── AuthContext.jsx    # Google OAuth + JWT
│       ├── hooks/
│       │   ├── useApi.js
│       │   └── useTheme.js        # Dark mode hook
│       └── lib/
│           └── api.js             # API client with namespaces
└── server/
    └── src/
        ├── index.js               # Express server entry
        ├── db/
        │   ├── schema.js          # SQLite schema + migrations
        │   └── models.js          # Data access layer
        ├── middleware/
        │   └── auth.js            # JWT auth middleware
        ├── routes/
        │   ├── tasks.js
        │   ├── projects.js
        │   ├── contexts.js
        │   ├── habits.js
        │   ├── auth.js
        │   └── ai.js              # All AI endpoints
        └── services/
            └── ai.js              # OpenAI integration
```

---

## Database Schema

### Tables
- **users** — `id`, `google_id`, `email`, `name`, `picture`, `created_at`, `last_login`
- **tasks** — `id`, `title`, `notes`, `list` (inbox|next_actions|waiting_for|someday_maybe|completed), `context`, `project_id`, `waiting_for_person`, `due_date`, `energy_level` (low|medium|high), `time_estimate`, `priority`, `is_daily_focus`, `position`, `completed_at`, `user_id`, `created_at`, `updated_at`
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

### AI Features (OpenAI GPT-4o)
- **Process Inbox** — AI analyzes inbox tasks, suggests which list each belongs to, assigns priority/energy/time
- **Daily Focus** — AI picks top priorities for today based on energy, deadlines, importance
- **Find Duplicates** — AI scans all active tasks for duplicates, suggests which to keep/remove
- **Import Notes** — Paste bulk text from other apps, AI categorizes each item into GTD lists
- **Weekly Review Analysis** — AI evaluates system health (1-10 score), identifies stale items, flags projects needing attention, suggests follow-ups on waiting-for items, provides actionable recommendations

### Project Execution Modes
- **Parallel** (default) — All project tasks visible in Next Actions simultaneously
- **Sequential** — Only the first uncompleted task is visible; completing/deleting auto-promotes the next task
- Tasks within sequential projects can be reordered with up/down arrows
- Mode can be toggled on existing projects (auto-assigns positions when switching to sequential)

### Other
- **Habit Tracking** — Daily/weekly habits with streak tracking, calendar view, past-date logging, default categories (Health, Fitness, Mindfulness, etc.), suggested habits quick-add, case-insensitive category deduplication
- **Dark Mode** — Toggle with system preference detection, flash prevention
- **Responsive Design** — Collapsible sidebar on mobile, touch-friendly
- **Google OAuth** — Secure login, multi-user support

---

## API Endpoints

### Tasks: `/api/tasks`
- `GET /` — Get all tasks (optional `?list=` filter)
- `POST /` — Create task
- `PUT /:id` — Update task
- `PUT /:id/complete` — Mark complete
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
- **AI-powered features** (inbox processing, duplicate detection, daily focus, weekly review analysis — most competitors don't have this)
- **Weekly Review workflow** (only OmniFocus and FacileThings have this — our version adds AI insights)
- **Sequential/parallel projects** (like OmniFocus, unlike most competitors)
- **Built-in habit tracking** (only TickTick does this among competitors)
- **Modern UI with dark mode** (FacileThings and Nirvana feel dated)
- **Energy levels & time estimates** on tasks

### Potential Future Features (Prioritized by User Demand)

Based on community research across Reddit (r/productivity, r/todoist, r/gtd, r/ticktick, r/omnifocus — 3.7M+ combined members), Facebook groups, review sites, and market analyses (April 2026). Full report: `FEATURE_RESEARCH_2026.md`

#### High Priority (most requested across all communities)
1. **Start/defer dates** — Hide tasks until actionable; #1 persistent GTD request
2. **Calendar integration & time blocking** — Unified tasks + calendar view, drag-to-schedule; single most requested feature ecosystem-wide
3. **Recurring tasks** — Flexible patterns ("every 3 days", "on completion", specific days)
4. **Natural language input** — Parse "call John Monday at 2pm p1" into task + date + priority
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

Two deal-breakers for GTD practitioners:

1. **Recurring tasks** — Without this, users can't manage real workflows. Every competitor has it.
2. **Start/defer dates** — The #1 GTD-specific request. "Show me tasks only when they're actionable" is core GTD philosophy.

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

1. Ship recurring tasks + start dates (table stakes)
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
