# Cleartable — Project Knowledge

## Overview
Cleartable is a calm, AI-powered app for organizing tasks, habits, and calendar across work and life — built on the proven Getting Things Done (GTD) workflow by David Allen, but GTD is now **background credibility, not the headline** (positioning broadened 2026-06-17). App title: "The Calm Task App." Brand promise: clarity for work & life, with AI that does the organizing for you — opinionated, anti-anxiety. (Landing page de-GTD'd 2026-06-21: breadth section + reframed FAQs; GTD kept only in blog SEO + legal/trademark.)

**Domain:** cleartable.app (registered 2026)
**Deployed on:** Railway (auto-deploy from GitHub `main` branch)
**Repository:** https://github.com/DouJohn09/gtd-app (folder name retained as `gtd-app`; product name is Cleartable)
**Trademark note:** Inspired by Getting Things Done® (a registered trademark of the David Allen Company). Cleartable is not affiliated with or endorsed by DAC. The name "GTD" is used only descriptively, never as a brand element. **2026-07-05: all user-visible "GTD" strings removed from the app UI** (mode-picker copy, billing blurb, export blurb, "gtd workflow" card label) — landing/legal/blog keep their attributed nominative-fair-use references; internal `gtd-*` CSS classes untouched. Generic method vocabulary (Inbox, Next Actions, Waiting For, Someday/Maybe, Weekly Review, contexts) is not protectable and stays.

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 18 + Vite 5 + Tailwind CSS   |
| Backend    | Express 4 (Node.js, ES Modules)     |
| Database   | PostgreSQL 16 via `pg` + `node-pg-migrate` (Docker for local dev, Railway-managed in prod) |
| AI         | Groq Llama-3.3-70B primary + OpenAI GPT-4o(-mini) fallback (JSON mode, temp 0 for classification, schema-validated — see AI Features) |
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
│       │   ├── Settings.jsx     # Data export (JSON/CSV) + import (preview/commit)
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
        │   ├── ai.js              # All AI endpoints
        │   ├── export.js          # JSON full backup + Todoist-compatible CSV
        │   └── import.js          # Two-step preview/commit for JSON + CSV
        └── services/
            ├── ai.js              # OpenAI integration
            └── googleCalendar.js  # Google Calendar token management & event fetching
```

---

## Database Schema

### Tables
- **users** — `id`, `google_id`, `email`, `name`, `picture`, `google_calendar_access_token`, `google_calendar_refresh_token`, `google_calendar_token_expiry`, `created_at`, `last_login`, plus timezone/billing columns from later migrations and **`ai_mode`** (`off`|`assisted`|`auto`, default `assisted`), **`ai_accept_streak`**, **`ai_nudge_autopilot_at`**, **`ai_nudge_reminder_at`** (see AI Mode below)
- **tasks** — `id`, `title`, `notes`, `list` (inbox|next_actions|waiting_for|someday_maybe|completed), `context`, `project_id`, `waiting_for_person`, `due_date`, `start_date`, `energy_level` (low|medium|high), `time_estimate`, `priority`, `is_daily_focus`, `position`, `completed_at`, `recurrence_rule` (daily|weekdays|weekly|monthly|yearly|custom), `recurrence_interval`, `recurrence_days`, `recurrence_type` (absolute|relative), `user_id`, `created_at`, `updated_at`
- **projects** — `id`, `name`, `description`, `status` (active|completed|on_hold), `outcome`, `execution_mode` (parallel|sequential), `user_id`, `created_at`, `updated_at`
- **weekly_reviews** — `id`, `user_id`, `completed_at`, `inbox_count_at_start`, `tasks_completed`, `tasks_moved`, `tasks_deleted`, `ai_summary`, `created_at`
- **contexts** — `id`, `name`, `user_id`, `created_at`
- **habits** — `id`, `name`, `description`, `frequency` (daily|weekly|specific_days|**interval**), `target_days` (also holds N for interval / X for weekly), `category`, `color`, `user_id`, `active`, `created_at`, **`type`** (`build`|`quit`, default `build`). Interval habits are anchored to `created_at` (due on the anchor + every Nth day).
- **habit_logs** — `id`, `habit_id`, `completed_date`, `user_id`, `created_at`, **`status`** (`done`|`skipped`|`slip`, default `done` — skipped=rest day/neutral; slip=quit-habit lapse), **`note`** (optional text per log)
- **waitlist** — `id`, `email` (UNIQUE), `source` (`hero`|`bottom-cta`), `created_at`, `unsubscribed_at`. Captured from the marketing landing page form; not tied to a logged-in user.

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
- **Inline project creation from the task modal** — the project select has an "+ Add new project…" entry that swaps in a small input; mirrors the existing inline context-add and works in every modal callsite (Lists, Calendar, Dashboard, Inbox, Projects)

### AI Features (Groq + OpenAI)

AI runs through a provider abstraction in `server/src/services/ai.js`: a per-task `ROUTING` map picks a primary model, and `complete()` auto-falls-back to OpenAI on any error, rate-limit, JSON-parse failure, **response truncation** (`finish_reason=length`), or **schema-validation failure** (after one repair round-trip). Every task now runs **Groq Llama-3.3-70B primary** with a gpt-4o(-mini) fallback floor. Every call is metered (see Build Backlog #4).

**AI Mode dial (2026-07-04, `7a3adb9`)** — one server-side setting (`users.ai_mode`) replacing the old client-only Smart Capture routing preference, so it follows the account across devices and can't be bypassed by a stale client:
- **`off`** — fully manual/GTD-purist. The server refuses to call any AI provider for this user (enforced in `routes/ai.js`, not just hidden in the UI) — Smart Capture creates the raw task with no AI call, Weekly Review serves its data without the analysis step and without spending AI budget. Every AI surface (nav entry, sparkle buttons, AI Assistant page, project breakdown, custom-list URL extraction) disappears client-side; Settings states plainly that task text is never sent to a provider in this mode.
- **`assisted`** (default for new signups and users who skip the onboarding choice) — Smart Capture parses metadata but every task still lands in the Inbox for confirmation; other AI tools remain on-demand only.
- **`auto`** — the original confidence-gated behavior: AI-confident tasks auto-route to their final list, ambiguous ones fall back to Inbox. Existing users at ship time were backfilled to this mode since it was their prior effective default.
- Onboarding: the first-run tour opens with a "How should Cleartable work for you?" mode choice (3 cards) before the usual capture/clarify/today steps, which are rewritten per chosen mode. This choice doubles as the "how do I use this app" explanation new users were missing.
- Two one-time nudges (assisted-mode only, each fires at most once per account, timestamped server-side so they never repeat): a "turn on Autopilot?" card after 20 AI inbox-suggestions accepted in a row without an edit/skip (`ai_accept_streak`, resets on any correction), and a 30-day-since-signup reminder gated on a modest streak (≥5) so it's never pitched to someone AI has been getting wrong.
- 502/503 (provider down) and 429 (daily cap) responses from any AI endpoint now render as calm info toasts across the app (`client/src/lib/aiError.js`) instead of alarming error toasts.

**Precision overhaul (2026-07-03, `efa4f39` — full writeup in `REVIEW_2026-07-03_AI_AND_UX.md`):**
- **Per-task sampling** (`TASK_PARAMS`): temperature **0** for classification/extraction (was provider default 1.0 → nondeterministic classification), 0.2–0.4 for advisory prose; per-task `max_tokens` caps + truncation detection.
- **Schema validation** (`services/aiSchema.js`): every response validated (enums, priority range, dates/times, index bounds) with LLM-slop coercion (`"null"`→null, `"4"`→4); one self-repair round-trip before provider fallback.
- **Priority scale** stated everywhere: integer **1-5, 5 = most important** (matches the app's descending sort; was previously undefined).
- **Plain-language `reasoning`** — user-facing explanations no longer emit GTD jargon.
- **Unified error contract:** 503 unconfigured / 502 all-providers-failed (was: some AI failures returned `{error}` as a 200 body).
- Shared prompt helpers (`formatContextOptions`, `formatHistoryBlock`) so every classifier sees the user's world identically.

- **Smart Capture** (Groq; fallback GPT-4o-mini) — Real-time AI on every Quick Capture: auto-categorizes list, context, priority, energy, time estimate; extracts due/start dates from natural language; detects waiting-for patterns; sets daily focus for urgent/today only; auto-matches to existing projects; detects recurrence; prefers life-domain contexts (Personal/Work/Family) over activity-type (@phone/@computer); **flags `possible_duplicate_of` against the user's open tasks**. Returns `list_confidence` for inbox-routing of ambiguous captures. Few-shot with the user's 10 most-recently-updated classified tasks (learns from corrections). Toggle per-capture (Sparkles icon, resets on each mount); routing behavior driven server-side by `users.ai_mode` (see AI Mode dial above), not a client param. A provider-unconfigured response now degrades to a plain raw capture instead of surfacing an error.
- **Process Inbox** (Groq; fallback GPT-4o) — categorizes inbox tasks; now also injected with **active projects** (emits `project_name` resolved to id), **today's date** (emits due dates), few-shot history; emits energy/time/waiting-for. Server normalizes `time_estimate_minutes`→`time_estimate` for the apply route.
- **Daily Focus** (Groq; fallback GPT-4o) — picks today's priorities; now sees **due dates, overdue-by-days, start dates, priority, today's date, and minutes already time-blocked today** (previously judged by title alone).
- **Find Duplicates** (Groq; fallback GPT-4o) — scans active tasks; instructed that recurring tasks are never duplicates and to preserve unique notes before deletion.
- **Import Notes** (Groq; fallback GPT-4o) — bulk-text → categorized GTD items, per-item independence rules.
- **Analyze Task** (Groq; fallback GPT-4o) — single-task GTD recommendation; now gets projects + today's date + history; **metered** (was unmetered).
- **Project Breakdown** (Groq; fallback GPT-4o) — suggests next actions; now sees the project's **existing tasks** (no duplicate suggestions) and execution mode; **metered** (was unmetered).
- **Weekly Review Analysis** (Groq; fallback GPT-4o) — system-health score, stale items, projects needing attention, waiting-for follow-ups, recommendations; now labels truncated lists ("showing 30 of N"), sees a someday sample, and emits `someday_candidates` (a real "Get Creative" step). *(Client does not yet render `possible_duplicate_of` or `someday_candidates` — server emits both; small UI follow-up.)*

### Calendar
- **Calendar view** — Month/week/day grids with tasks by due date and start date, unscheduled sidebar, drag-and-drop scheduling
- **Google Calendar sync** — Opt-in OAuth connection, reads events and displays alongside tasks with violet styling, click to open in Google Calendar. Timed events render in the hour grid at their actual start; all-day events live in the all-day strip
- **Time blocking** — Tasks can hold `scheduled_time` (HH:MM) + `duration` (minutes). Drag tasks onto specific time slots in Day/Week views; blocks snap to 15-min increments and resize via the bottom edge. In Day view, tasks already in the all-day strip (due today, no scheduled time yet) are also draggable directly onto the hour grid
- **Push to Google Calendar** — When a task has a scheduled time, it's pushed (one-way) to a dedicated "Cleartable" calendar so the user's primary calendar stays untouched. Requires the calendar-write OAuth scope; a banner prompts re-consent for users who connected before that scope existed. The browser's IANA timezone is forwarded on every API call via an `X-Client-Timezone` header and used as the event's `timeZone`, so naive HH:MM scheduled times stay anchored to the user's local time regardless of the server's TZ
- **AI-assisted scheduling (MVP)** — Smart Capture detects free-slot intent ("find me 30 min tomorrow afternoon"), reads tasks + Google events for the target day inside hardcoded working hours (9-18 weekdays, 10-16 weekends), and auto-books the first open window. Fallback toast if no slot fits
- **Overlap layout** — Concurrent blocks at the same hour cluster transitively and render as side-by-side columns sized by `1 / cluster max-concurrent`. Non-overlapping blocks keep full width

### Today's Focus
- **Auto-surface due-today and overdue tasks** — The Today list isn't just `is_daily_focus = 1` anymore. It also picks up anything `due_date <= today` (excluding `someday_maybe`, respecting `start_date`). Matches Things/Todoist behavior so a task created with `due_date = tomorrow` shows up automatically when tomorrow arrives
- **Hide overdue toggle** — Optional per-user toggle on the Today's Focus header (chip alongside Filter/Sort) suppresses anything where `due_date < today`. Addresses the "mountain of shame" backlog-anxiety pattern users report on r/productivity and r/ADHD. Preference persists in localStorage (`hide_overdue_focus`). Chip only appears when overdue tasks exist or the toggle is already on

### Data export & import
- **Export** — Settings → Data offers JSON (full backup of tasks, projects, contexts, habits, habit_logs) and CSV (Todoist-compatible columns + GTD extras at the end so a round-trip back into Cleartable keeps `LIST`, `CONTEXT`, `PROJECT`, `ENERGY`, `RECURRENCE`, etc.). Priority is inverted on CSV export to match Todoist's 1=highest convention
- **Import** — Two-step preview/commit flow under the same Settings page. Auto-detects format by extension + content sniff. JSON path merges projects + habits by name (case-insensitive); habit logs preserve dates via `INSERT OR IGNORE`. CSV path re-inverts priority back to our 4=highest scheme, opportunistically reads our extras when present, and falls back to Inbox when no `LIST` column. Append-only (no duplicate detection — users can run AI duplicate finder afterward)

### Project Execution Modes
- **Parallel** (default) — All project tasks visible in Next Actions simultaneously
- **Sequential** — Only the first uncompleted task is visible; completing/deleting auto-promotes the next task
- Tasks within sequential projects can be reordered with up/down arrows
- Mode can be toggled on existing projects (auto-assigns positions when switching to sequential)

### Other
- **Habit Tracking** — Build & **quit** habits; schedules: daily / weekly-X× / specific-days / **every-N-days (interval)**. Schedule-aware streaks + completion rate (90-day heatmap). **Anti-guilt model:** per-day **skip/rest days** (neutral — bridge streaks, excluded from rate) + **vacation/rest-day ranges** (bulk-rest all build habits for a span) + de-emphasized forgiving streaks. **Quit habits** track days-clean (a log = a slip). **Per-habit calendar popover** (portaled to body) — click a day to *select* it (non-destructive), explicit Done/Rest/Clear (or Slip/Clean) buttons set state, plus an optional **note per log**. Default categories + suggested-habit quick-add (incl. a quit example), case-insensitive category dedup. Free=3 gate.
- **Neo-modern glass UI** — Aurora gradient background, frosted glass cards, semantic color tones per GTD list (inbox→amber, next→mint, waiting→rose, someday→violet); Instrument Serif display headings, Geist Mono labels; ⌘K global capture
- **Dark mode (locked)** — Aesthetic is dark-only at present; CSS-variable design tokens are architected so a future light theme is a single `:root:not(.dark)` override
- **Responsive Design** — Sidebar on desktop, bottom-tab nav on mobile
- **PWA installable** — Web app manifest + Workbox service worker so Cleartable can be pinned to a phone home screen (iOS Add-to-Home-Screen, Android Install prompt) or installed as a desktop app via Chrome's install button. Shell loads offline; `/api/*` is NetworkOnly so task data is always fresh
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
- `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` (create/update accept `type` build|quit)
- `POST /:id/toggle` — set or cycle a date's state. `{ date?, status? }`: with `status` (`done`|`skipped`|`slip`|`none`) sets directly (upsert preserves note); without, cycles (build: none→done→skipped→none; quit: none→slip→none)
- `GET /stats` — schedule-aware streak + completion stats (branches by build/quit), heatmap (done-only)
- `GET /:id/logs` — a habit's logged days `[{date,status,note}]` (powers the calendar popover)
- `PUT /:id/logs/:date` — set/clear the `{ note }` on a day's log (404 if no log; 500-char cap)
- `POST /rest-days`, `DELETE /rest-days` — `{ from, to }`: bulk set/clear rest days for all active build habits (reuses `skipped`; set uses ON CONFLICT DO NOTHING to preserve logged days)

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
- `POST /weekly-review` — Full system analysis with AI insights (skips analysis + budget spend when `ai_mode = off`, returning `aiAnalysis: { error: 'ai_off' }`)
- `POST /complete-review` — Apply review changes and record completion

### Preferences: `/api/preferences`
- `PUT /ai-mode` — Set `users.ai_mode` (`off`|`assisted`|`auto`)
- `POST /ai-feedback` — Report `{ accepted, adjusted }` from an applied AI suggestion batch; increments or resets `ai_accept_streak` server-side (any `adjusted > 0` resets to 0)
- `POST /ai-nudge-seen` — Mark one of the two one-time Autopilot nudges (`autopilot`|`reminder`) as shown, so it never repeats

### Export: `/api/export`
- `GET /json` — Full backup (tasks, projects, contexts, habits, habit_logs) as a downloadable JSON file
- `GET /csv` — Tasks as Todoist-compatible CSV (priority inverted to 1=highest) with GTD extras (`LIST`, `CONTEXT`, `PROJECT`, `ENERGY`, `RECURRENCE`, etc.) appended for lossless round-trip

### Import: `/api/import`
- `POST /preview` — Accepts `{ filename, content }`, sniffs format (`gtdflow-json` or `todoist-csv`), returns counts + first 5 task titles for confirmation
- `POST /commit` — Accepts `{ format, payload }`, creates records (merges projects/habits/contexts by name, preserves habit_log dates via `INSERT OR IGNORE`, falls back to Inbox when CSV has no LIST). Append-only — duplicates left for the AI duplicate finder

### Auth: `/api/auth`
- `POST /google` — Google OAuth login
- `GET /me` — Get current user (includes `google_calendar_connected`, `ai_mode`, `ai_accept_streak`, nudge timestamps, `created_at`)
- `GET /google-calendar/status` — Calendar connection status
- `POST /google-calendar` — Connect Google Calendar (exchange auth code for tokens)
- `DELETE /google-calendar` — Disconnect Google Calendar (revoke + clear tokens)
- `GET /config` — Get Google Client ID

### Waitlist: `/api/waitlist`
- `POST /` — Public, no auth. Accepts `{ email, source }`. Inserts into `waitlist` table with `ON CONFLICT (email) DO NOTHING`. Server-side email regex catches bot garbage; in-memory rate limit (5/min/IP). Always returns `{ ok: true }` to prevent email enumeration on duplicates.

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

### Cleartable Differentiators
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
2. ~~**Calendar integration & time blocking**~~ — ✅ All four phases shipped: calendar view, Google Calendar sync (read + write), time blocking (drag onto slots, snap, resize, push to dedicated "Cleartable" calendar), and AI-assisted free-slot booking via Smart Capture.
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

**Phase 1 — Calendar view of tasks (shipped):**
- Day/week/month calendar grid showing tasks by due date
- Unscheduled tasks in a sidebar panel
- Drag tasks to assign/change due dates visually

**Phase 2 — Google Calendar sync (shipped):**
- One-click Google Calendar connection (reuse existing Google OAuth)
- Read calendar events and display alongside tasks (timed events in the hour grid, all-day in the strip)
- Users see busy/free time at a glance during daily planning
- Overlap layout: concurrent blocks cluster transitively and render as side-by-side columns

**Phase 3 — Time blocking (shipped):**
- Drag tasks from sidebar onto specific time slots; blocks snap to 15-min and resize via the bottom edge
- Tasks store `scheduled_time` + `duration`
- One-way push to a dedicated "Cleartable" Google Calendar (separate calendar-write OAuth scope; re-consent banner for legacy users)

**Phase 4 — AI-assisted scheduling (shipped, MVP):**
- Smart Capture detects free-slot intent ("find me 30 min tomorrow afternoon")
- Reads tasks + Google events for the target day inside hardcoded working hours (9-18 weekdays, 10-16 weekends)
- Auto-books the first open window; falls back to a toast if no slot fits
- Future: pull energy levels and time estimates into the ranking instead of first-fit

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
| `OPENAI_API_KEY` | OpenAI API key — the fallback floor for every AI task. ⚠️ **Account quota exhausted since ~2026-06-30 (billing 429) — the fallback is currently DEAD; if Groq fails, AI features 502. Restore billing or upgrade Groq Dev Tier before launch.** |
| `GROQ_API_KEY` | Groq API key — primary for Smart Capture + objective AI ops. If unset, those transparently use the OpenAI fallback |
| `AI_DAILY_LIMIT_FREE` / `AI_DAILY_LIMIT_PRO` | Per-tier daily AI-call cap. `0`/unset = unlimited (enforcement OFF; usage still counted) |
| `RESEND_API_KEY` | Resend API key for transactional email (waitlist welcome). **Unset = email no-ops (logs, never sent) — signup still succeeds.** Activate by verifying `cleartable.app` as a sending domain in Resend, then setting this |
| `WAITLIST_FROM_EMAIL` | Sender for waitlist email, e.g. `Cleartable <hello@cleartable.app>` (default). Must be an address on a Resend-verified domain |
| `DATABASE_URL` | Postgres connection string (Railway injects the internal URL; `DATABASE_PUBLIC_URL` on the Postgres service for off-network access) |
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

## Naming & Brand

### Why "Cleartable"

The product launched internally as "GTD Flow" but pivoted to **Cleartable** before public launch for two reasons:

1. **Trademark risk.** "GTD" and "Getting Things Done" are registered trademarks of the David Allen Company (DavidCo B.V.; USPTO reg. 77208713 and 3022721 respectively). Using "GTD" as the leading brand element of an app — as opposed to descriptively in marketing copy — creates real risk of a cease-and-desist, App Store/Play Store takedown, and Google Ads keyword restriction. The DAC handles trademark use case-by-case (general@davidco.com, anne@davidco.com) and is known to actively protect the mark. Established competitors (Things 3, OmniFocus, Nirvana, FacileThings, Todoist, TickTick) all avoid putting "GTD" in their product name for this reason.
2. **Positioning ceiling.** "GTD Flow" leads with an acronym most general productivity users don't recognize, capping addressable audience at the ~5% who already practice GTD. "Cleartable" reads to anyone — GTD practitioners recognize the spiritual fit (clear table = empty inbox = clear mind), non-GTD users just see a calm, opinionated task app.

### Brand voice

- **Calm, opinionated, not gamified.** Anti-anxiety positioning explicitly rejects the Habitica/Finch/streaks-and-XP school. AI is framed as "reduces friction," not "does it all for you" — directly addressing the AI skepticism documented in `FEATURE_RESEARCH_2026.md` Part 4.
- **GTD-shaped without GTD-branded.** The app's surfaces (Inbox, Next Actions, Waiting For, Someday/Maybe, Weekly Review) are GTD-native, but the marketing language is outcome-language ("clear your table," "process the inbox," "calm your week"). GTD is referenced descriptively in copy ("inspired by Getting Things Done®"), never as the brand.
- **Channel-specific messaging.** In r/gtd: speak GTD fluently. In r/productivity: translate to general-audience benefits (inbox zero, calm planning, AI-assisted clarification). Same product, different vocabulary per channel — this is discipline, not inconsistency.

### Tagline candidates

- "Clear your table. Clear your mind."
- "The calm task app that actually processes your inbox."
- "Capture everything. Let AI clarify. Review weekly. Never feel behind."

---

## Go-to-Market Strategy

### Realistic Outcome Target

The goal is **a few hundred to a few thousand paid users — side-income scale, not unicorn scale.** Concretely:

- **6 months:** 50-200 paid users (~$1.5-6K ARR at $30/yr founder pricing). Achievable if P0 infra ships, landing page is live, demo video exists, and Reddit launch happens authentically.
- **12-18 months:** 500-2,000 paid users (~$18-72K ARR at $36/yr list). Achievable with sustained founder presence, content cadence, and product iteration.
- **Honest constraint:** This is **not** "ship and the cash rolls in." It's a part-time job that pays like a side income. Productivity apps see 30-50% annual churn even when users love them, so growth requires continuous distribution effort, not just a launch spike.

### Positioning — Niche acquisition, broad utility

Don't compete with Todoist/TickTick on general task management. Don't position as "GTD-only" either — that caps the audience at the 5% who study the methodology.

**The split:**
- **Acquisition channels target the GTD niche.** r/gtd (80K members) is the beachhead — clear positioning, reachable audience, high intent. The product's GTD-native architecture maps perfectly to their mental model.
- **Landing page and product copy speak to the broader productivity audience.** Outcome-language, not methodology-language. A non-GTD user reads "calm task app, AI inbox processing, weekly review built in" and sees a productivity tool that just feels good. A GTD practitioner reads the same copy and recognizes their system.

**Competitive frame:**
- **vs OmniFocus**: Cross-platform, AI-powered, lower price, modern UI
- **vs FacileThings**: Modern UI, faster, AI features, dark mode
- **vs Nirvana**: Active development, habits, weekly review with AI insights
- **vs Todoist/TickTick**: GTD-native by design, not GTD-as-afterthought

The unique combination (AI Smart Capture + Process Inbox + Weekly Review with AI + sequential/parallel projects + calendar time-blocking + habit tracking) doesn't exist anywhere else under one roof.

### Must-Ship Before Launch — Status

Two deal-breakers for GTD practitioners — **both shipped:**

1. ~~**Recurring tasks**~~ — Daily/weekdays/weekly/monthly/yearly/custom with absolute or relative recurrence. **Done.**
2. ~~**Start/defer dates**~~ — Tasks hidden until start date, toggle chip to reveal deferred tasks. **Done.**

Three infrastructure items that **blocked** taking money — Postgres and PWA shipped, landing page live; only the demo video remains:

1. ~~**Migrate off sql.js to persistent Postgres**~~ — ✅ Shipped 2026-05-17 (Railway-managed PG; production data recovered).
2. ~~**PWA support**~~ — ✅ Shipped 2026-05-31 (installable, update banner).
3. **Landing page at cleartable.app** ✅ (live 2026-05-17) **+ demo video** (still to record) — video needed before any traffic-driving post.

### Pre-Launch Checklist (in execution order)

1. **Cleartable.app domain** — ✅ Acquired May 2026 ($12.98/yr first year, $17.98/yr renewal). WhoisGuard enabled.
2. ~~**Coming-soon landing page**~~ — ✅ Live at cleartable.app/ with waitlist email capture (own `/api/waitlist` into PG, 2026-05-17).
3. ~~**Migrate off sql.js to Postgres on Railway.**~~ — ✅ Shipped 2026-05-17 (incl. production data recovery).
4. ~~**PWA support**~~ — ✅ Shipped 2026-05-31 (manifest, service worker, install prompt, update banner).
5. **Record 75-90s demo video** per `DEMO.md` storyboard (60s cut: `DEMO_60S.md`). Embed on landing page.
6. **Stripe + paywall integration** for Pro tier. Free + Pro feature gates wired in.
7. **Soft launch on r/gtd** — only after items 1-6 are live. See Launch Sequence below.

### Founder Presence — The Hidden Variable

The single biggest determinant of success for an indie productivity app is **the visibility of the founder.** Indie productivity apps that work have a recognizable human behind them — on Twitter/X, on Reddit, on a blog. "Built by one person who does GTD" is the narrative that converts. Without that presence, even the best product struggles to find its audience because productivity apps generate almost no organic word-of-mouth (people don't tell friends about their todo app the way they recommend a game or a design tool).

**Acceptance:** the founder commits to public-facing distribution work for 18-24 months. Without that commitment, scale back the ambition or the timeline.

### Distribution Strategy

Three channels, ranked by return per hour for this product/audience:

**Channel 1 — Reddit (highest ROI; primary).**
The audience is already there: r/gtd (80K), r/productivity (3.7M), r/ADHD (1.5M), r/todoist (100K+), r/ProductivityApps (30K). These communities have predictable recurring questions ("How do I do a weekly review?", "Todoist alternatives after the price hike?", "Best GTD app for Windows?"). Show up daily, answer questions helpfully without pitching, build comment history. **Two-week lurk-and-help period before any launch post.** Mods reject pitch-first accounts with no history.

**Channel 2 — Twitter/X build-in-public (compounding; secondary).**
Daily or every-other-day updates: shipped features, broken builds, screenshots, revenue milestones. The build-in-public crowd is self-reinforcing and overlaps heavily with productivity buyers. Goal isn't follower count — it's compounding name recognition over 6-12 months. Specifics-and-screenshots beat philosophy threads.

**Channel 3 — Blog SEO (long-tail; tertiary).**
One 1,500-word post per week, targeting GTD-intent keywords ("how to do a weekly review," "Todoist alternatives," "best GTD app for Windows") and broad-productivity intent ("inbox zero," "calm task management"). Posts compound for years. Don't aim for viral — aim for ranking.

**Skip for now:** YouTube (high effort, optional), TikTok (audience mismatch), paid ads (no budget, no signal yet).

### Launch Sequence

| Phase | Channel | Angle |
|-------|---------|-------|
| Week -2 to -1 | Reddit (lurk + help) | Build comment history. No app mentions. Answer 5-10 questions/week thoughtfully across r/gtd, r/productivity. |
| Week 0 | Twitter/X intro | "Building Cleartable, a calm GTD app. Here's day one." Screenshot. Build-in-public account starts. |
| Week 0 | Blog post #1 | "How to do a weekly review that actually sticks." SEO-targeted. Linked from cleartable.app footer. |
| Week 1-2 | r/gtd soft launch (80K) | Problem-first post. "I built a GTD app because OmniFocus doesn't work on Windows and FacileThings felt dated." Authentic, no hype. |
| Week 3 | r/productivity (3.7M) + r/ProductivityApps (30K) | Lead with AI Smart Capture + calendar time-blocking. Calm-positioning, not feature dump. |
| Week 4 | Product Hunt | "AI-powered calm GTD app." Use the founder's annual deal ($30/yr, going to $36) as PH-launch incentive. |
| Week 5+ | Hacker News "Show HN" | Technical story: solo dev, modern stack, honest about constraints. |
| Week 6+ | Ongoing | Weekly blog post, daily Twitter, Reddit answer cadence. Iterate on product based on user feedback. |

### Demand-Validation & Promotion Research (verified 2026-06-08)

Deep-research pass (24 sources, 25 claims adversarially verified — 16 confirmed, 9 refuted). Only verified findings below.

**Demand-signal hierarchy (high confidence).** Strongest → weakest: (1) **real money / refundable commitment** — pre-sell annual Pro via Stripe or a refundable "founder's offer" pre-order; benchmark: *a paid list of 2,000 (with a $5 deposit) beats a free list of 10,000*, refund rates ~3–5%; (2) paid waitlist; (3) fake-door landing page + paid ads (a tier *below* real money — "clicks aren't customers"); (4) wish-posts / free signups (weakest alone). **Action for Cleartable:** the existing free `waitlist` table is the weakest tier — the highest-signal upgrade is a **refundable discounted founder's pre-sale** on the annual Pro plan (rides on the P0 Stripe work, doubles as validation + early revenue).

**Free venues that survived verification:** Waitlister / LaunchList (permanent free tier to 100 subs; LaunchList paid from $19 one-time) · Product Hunt · Hacker News Show HN · Uneed, Launching Next, TinyLaunch, MicroLaunch, DevHunt, Smol Launch (free tiers; optional $30–99 skip-queue). **Product Hunt reality (medium):** big 24h spike (3k–10k+ visits top products, up to ~30k for #1) that **decays to ~zero within 48h** — launch-day coordination >> the listing.

**Reddit as a demand-mining tool (high):** search exact phrases to surface unmet demand — `"I wish there was an app..."`, `"is there an app that..."`, `"I'd pay $X for..."`, `"why doesn't X exist..."`. Sobering: a study of 9,300+ "I wish there was an app" posts found **productivity is the most-requested *and* most-crowded category** — differentiation (AI Smart Capture, MCP) matters more than the category. r/SideProject (~739K per second-pass verification below) confirmed for early users/feedback — *show the building journey, a bare link = spam*.

**Don't use for forward-looking demand:** Indie Hackers `/ideas` is retrospective (Stripe-verified-revenue only). The IH *forum* is still a fine free venue (revenue-milestone posts get 5–10x engagement).

**Micro-influencer rates (10K–100K, 2026, high):** IG feed ~$150–500/post (Reels 2–3x) · TikTok ~$200–800/video · YouTube integration ~$500+. ⚠️ These are *lifestyle* baselines — **tech/SaaS/productivity charge 2–3x more** at equal follower count. Cheap entry models: free-early-access-for-review, affiliate. Vet for bought followers / low engagement / vague deliverables.

**Second pass — subreddits + creators (verified 2026-06-08, 23 sources, 16/25 claims confirmed):**
- **⚠️ Reddit hid public member counts (Sept 2025)** — subreddit pages now show a 7-day "Visitors" metric (28-day rolling avg); raw member counts are mod-only. *Every* member figure below is a third-party-tracker estimate (Hive Index / GummySearch), not Reddit-native. (high)
- **r/SideProject (~739K) is the clear launch-friendly target** — self-promotion and "I built this" app posts are its *core function*; a solo GTD maker with a build story + feedback ask is welcomed, not removed. Only norms: no bare links, no rapid reposts. (high)
- **r/SaaS ~716K** (not the ~180K blogs claimed) (high); **r/productivity ~4.2M** (medium — 3.2M still cited by some 2026 blogs).
- **Best verified creator — Tool Finder / Keep Productive (Francesco D'Alessio):** 450K+ YouTube subs, reviews/compares 1,000+ task apps (live "Todoist vs TickTick (2026)", "16 Best Todoist Alternatives", "Best GTD Task Management Apps" pages), and **openly sells placements: $39 one-off tool listing, $299/mo Platinum** (homepage pin + newsletter ad + rotated ads). Directly actionable. ⚠️ economics lean toward *paid* placement of *known* tools — unverified whether they'd feature a brand-new non-paying app for free. (high)
- **Secondary creator — Scott Friesen / Simpletivity:** YouTube, does multi-app comparisons (TickTick vs Todoist, Notion, ClickUp) despite a "consolidate your tools" homepage. Sponsorship-readiness not separately verified. (medium)

**⚠️ Refuted — do NOT re-trust (killed in verification, mostly SEO blogs):** Pass-1 productivity-subreddit counts/rules (r/productivity 1.2M/3.2M, r/SaaS ~180K & "affiliate-ban", r/microsaas ~85K/28K, r/indiehackers ~120K/175K); the "self-promo only in a weekly megathread" restriction for r/SaaS & r/SideProject; all BetaList traffic/pricing figures; Carl Pullein as a target (standardized on Todoist — he's the *archetype*, not a fit).

**Still OPEN (env couldn't reach reddit.com directly; GAP-2 under-delivered):** (1) actual rules/sizes for r/gtd, r/microsaas, r/EntrepreneurRideAlong, r/androidapps/iosapps, Notion/Obsidian tool communities — and which *ban* app promotion; (2) the remaining ~6 GTD creators (individual YouTubers/newsletters/X) who review multiple apps and take pitches — only 2 cleared verification; (3) whether Tool Finder / Friesen would cover a non-paying new app. Verify subreddit rules from the live sidebar before posting.

### Pricing Strategy

Pricing is set against subscription fatigue and Todoist's backlash ($48 → $60/yr). **No lifetime deal** (decided 2026-05-31) — lifetime buyers are deal-hunters, not recurring-revenue validators, and lifetime + recurring AI cost is structurally unsound. The launch deal is a **refundable founder's annual pre-sale** instead:

| Tier | Price | What |
|------|-------|------|
| Free | $0 | Core GTD (inbox, projects, contexts, recurring, defer, calendar) · saved filters · **8 projects** · **1 custom list** · **3 habits** · AI capture with a low soft daily cap → raw manual fallback |
| Pro | **$4/mo or $36/yr** | Unlimited projects / custom lists / habits · analytics dashboard · much higher AI soft cap |
| Founder's pre-sale | **$30/yr** (refundable, launch window only) | Pro annual at a discount — doubles as demand validation + early revenue, rides on the P0 Stripe work |

**Why these numbers work:** $36/yr matches TickTick Pro and undercuts Todoist Pro ($60/yr); the $30 founder price gives launch communities a real, honest deal ("$30 founder annual, going to $36") instead of a low list price discounted further. Pre-sale revenue covers AI/API costs and is the strongest willingness-to-pay signal (see demand-signal hierarchy above).

**AI cost discipline:** Smart Capture and the objective ops run on Groq's free tier with OpenAI as fallback (advisory ops stay on gpt-4o), so marginal AI cost is already low. Free tier still enforces a soft daily AI cap (metering shipped, enforcement currently OFF for calibration — flip on before launch) and degrades to raw capture rather than erroring. Track per-user cost monthly; it's the single biggest margin lever.

### Growth Channels (No Budget)

- **Reddit organic** — Primary. Genuine participation, not promotion. Pattern: 2 weeks of helpful answering before any product mention.
- **Twitter/X build-in-public** — Daily snapshots of the work. Compounds slowly but reliably.
- **Blog SEO** — GTD-intent keywords, 1 post/week. Long-tail traffic that doesn't depend on launch buzz.
- **"Built with AI" / indie directories** — One-time submissions to AI tool directories, IndieHackers product directory, Producthunt-adjacent lists.
- **Template / workflow sharing** — Let users export GTD setups as JSON templates and share them. Each shared setup is a backlink + word-of-mouth.

### What NOT to Do

- **Don't position as "the GTD app."** Cap on audience too low; trademark drift; alienates the broader productivity buyer.
- **Don't build collaboration yet.** Solo GTD users are the beachhead. Family/team is a different market with different feature priorities.
- **Don't build native mobile apps.** PWA first. Native only after revenue justifies it.
- **Don't compete on AI hype.** Position AI as friction-reducing, not "AI does everything." Users explicitly distrust the auto-everything pitch (per research).
- **Don't launch free-only.** Need signal on willingness to pay from day one. The refundable founder's annual pre-sale ($30/yr) generates that signal.
- **Don't optimize for follower count.** Optimize for DMs and replies. "Does your app support X?" is worth a hundred likes.
- **Don't bikeshed the brand.** Cleartable is the name. Move on to product and distribution work.

### Priority Order

1. ~~Ship recurring tasks + start dates~~ **Done**
2. ~~Domain registered (cleartable.app)~~ **Done**
3. ~~Stand up landing page with email capture (cleartable.app + /api/waitlist)~~ **Done**
4. ~~Migrate off sql.js to Postgres~~ **Done**
5. ~~PWA support~~ **Done**
6. Record 75-90s demo video (per DEMO.md / DEMO_60S.md)
7. Stripe paywall + Free/Pro tiers (no lifetime; MoR-vs-Stripe decision first)
8. Soft launch on r/gtd with $36/yr Pro and $30/yr refundable founder's pre-sale
9. Expand to r/productivity + Product Hunt + HN over weeks 3-5
10. Sustained Reddit + Twitter + blog cadence; iterate based on feedback

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
26. Today's Focus auto-surfaces due-today and overdue tasks (matches Things/Todoist behavior)
27. Demo seed script + DEMO.md walkthrough for trial accounts
28. JSON + CSV export under Settings (Todoist-compatible CSV with GTD extras for lossless round-trip)
29. JSON + CSV import with two-step preview/commit, project/habit name merging, missing-LIST → Inbox fallback
30. Calendar bugfix: timed Google Calendar events now render in the hour grid instead of the all-day strip
31. Calendar overlap layout: concurrent blocks cluster transitively and render side-by-side
32. Calendar bugfix: Google Calendar push now uses the browser's IANA timezone (forwarded via X-Client-Timezone header) instead of the server's TZ — events created at 2pm Prague no longer land at 4pm on Google
33. Day view UX: all-day strip tasks are draggable onto the time grid (previously only the right-side Unscheduled sidebar supported this)
34. Inline project creation from the task modal — "+ Add new project…" option mirrors the existing context-add pattern
35. Hide-overdue toggle on Today's Focus — calms the dashboard for users overwhelmed by backlog (community-feedback driven)
36. Rebrand "GTD Flow" → "Cleartable" across UI, server strings, exports, and Google Calendar (legacy GCal calendars auto-renamed on next push; import accepts both old + new payloads)
37. Smart Capture context overhaul — prefer life-domain (Personal/Work/Family) over activity-type (@phone/@computer); inject user's 10 most recent classified tasks as few-shot history; add context delete UI in Settings (chips with X + ConfirmModal)
38. Smart Capture confidence-gated routing — AI returns `list_confidence`; server routes low-confidence tasks to Inbox even when other parsing is confident; Settings → Smart Capture toggle for "Auto-route (recommended)" vs "Always send to Inbox"; prompt tightened to forbid hallucinating verbs for noun-only inputs ("birthday gift" stays "birthday gift", not "Buy birthday gift"); few-shot now orders by `updated_at` so user corrections (re-classifying tasks) train the AI for next capture
39. Mobile bugfix: Custom Lists section was missing from the mobile "More" sheet — only the desktop sidebar rendered them. Added a `lists` group with add-new affordance to the More sheet
40. Postgres migration (Phase 1-5 shipped locally) — full data layer swap from in-memory sql.js to managed PG. Schema ported to `node-pg-migrate`, all models + routes + services rewritten async on `pg.Pool`, BOOLEAN columns replace INT-as-bool, one-shot data migration script preserves IDs. Docker Compose for local dev; Railway-managed PG provisioned but cutover deferred to Phase 6.
41. Postgres cutover on Railway (Phase 6) — `gtd-app` service wired to `DATABASE_URL` reference of the Postgres addon. Schema migration ran against Railway PG via `DATABASE_PUBLIC_URL` (the internal `postgres.railway.internal` hostname is only resolvable inside Railway's network). Prod cleartable.app verified healthy.
42. Data recovery from Railway volume — legacy `/data/gtd.db` (164K) survived on the `gtd-app-volume` mount across the deploy. Recovered via a temporary token-protected `GET /__recovery/gtd-db` endpoint streamed to local Mac, since `railway ssh` host-key verification doesn't auto-accept in non-TTY. `server/scripts/recover-user-data.js` then migrated jan.bambas@rohlik.cz's 80 tasks + 7 projects + 4 habits + 15 habit logs + 1 custom list + 7 list items + 8 contexts (local user_id=2 → prod user_id=1) with full FK remapping.
43. Pre-created theliau.bevilacqua@rohlik.cz prod user row directly from sqlite (preserving google_id so Google OAuth matches on next login), then migrated their 5 tasks + 6 contexts. Recovery endpoint reverted, RECOVERY_TOKEN unset, local copy of prod DB deleted.
44. PWA support via `vite-plugin-pwa` — manifest.webmanifest, Workbox service worker (autoUpdate, precaches ~461 KiB app shell, NetworkOnly for `/api/*` so task data is never stale), iOS Add-to-Home-Screen meta tags, theme-color matching the dark UI. App icons (192/512/512-maskable/180/favicon) generated from the brand identity (violet→mint gradient + Lucide Sparkles glyph) by a one-source-SVG script (`npm run pwa:icons`).
45. Waitlist signup flow — new `waitlist` PG table (id, email UNIQUE, source, created_at, unsubscribed_at) + `POST /api/waitlist` public endpoint with server-side email regex, in-memory 5/min/IP rate limit, `ON CONFLICT (email) DO NOTHING` idempotency, always returns `{ ok: true }` to prevent email enumeration. Landing page form wired to it; passes `source: hero|bottom-cta` for conversion attribution. Own the data, no vendor lock-in, can mass-mail the list ourselves at launch via Resend.
46. URL routing split: cleartable.app/ now serves the landing page (marketing) and cleartable.app/app/* serves the React app. Vite `base: '/app/'` on build only (dev stays at `/`). BrowserRouter `basename={import.meta.env.BASE_URL}` so routes work transparently. PWA manifest scope/start_url moved to `/app/` so installed PWA opens the app, not the landing page. Express production block dual-static-serves `landing-page/` at root and `client/dist/` at `/app` with SPA fallback. Landing nav gets a discreet "Sign in" link pointing to `/app`.
47. PWA reload prompt — `vite-plugin-pwa` `registerType` switched from `'autoUpdate'` to `'prompt'`. New `UpdatePrompt` component (uses `useRegisterSW` from `virtual:pwa-register/react`) renders a glass "New version available · Reload" banner pinned bottom-center, mounted globally inside `ToastProvider`. Triggered by a stale-SW incident where users on long-running sessions kept seeing the pre-`ConfirmModal` build days after the fix shipped. Also: TaskCard's right-side TODAY/queued badge now fades on `group-hover` so the row-overlay delete trash icon stops visually colliding with it on Lists/Inbox.
48. AI usage metering + soft-throttle (P0 #4) — `ai_usage` PG table (one row per user/UTC-day), `services/aiUsage.js` (`consume()` charges budget, increments only when allowed; tier resolver stubbed to `free` until #5), `middleware/aiLimit.js` (429 `daily_ai_limit` for explicit AI actions, fails open). Smart Capture over budget degrades to raw capture instead of hard-blocking; `GET /api/ai/usage` exposes the counter. **Enforcement ships OFF** — `AI_DAILY_LIMIT_FREE/_PRO`, 0/unset = unlimited — so prod counts real usage first, to calibrate the cap before turning it on.
49. Free AI provider, phase 1 (P0 #12) — Smart Capture moved to **Groq Llama-3.3-70B** (chosen over Gemini, whose free tier trains on inputs — unacceptable for private task content). Provider abstraction + per-task `ROUTING` + `complete()` auto-fallback to OpenAI on error/rate-limit/JSON-parse-fail, in `services/ai.js`. Eval (`scripts/eval-smart-capture.mjs`): quality parity 32/32 vs gpt-4o-mini, ~830ms vs ~3540ms (~4x faster) at zero marginal cost. Groq client `maxRetries:0, timeout:15000` so stalls fail fast to fallback.
50. Free AI provider, phase 2 (P0 #12) — all heavy ops routed through `complete()`; `__setForceRoute` hook + `scripts/eval-heavy-ops.mjs`. Schema validity 100% on both models incl. the nested weekly-review schema. Migrated to Groq: process-inbox, import-notes, find-duplicates, url-extract. **Kept on gpt-4o**: weekly-review, project-breakdown, analyze-task, daily-priorities — structural parity proven but side-by-side samples show gpt-4o gives better *advice*, and they're a natural Pro-tier lever.
51. Deploy auto-migrate — added `deploy.preDeployCommand: "cd server && npm run db:migrate"` to `railway.json` so every deploy runs pending migrations before start (a failing migration halts the deploy). Fixes the root cause of a prod outage: the metering commit's `ai_usage` table was never created on prod (deploy only ran `npm start`), so Smart Capture 500'd on every capture; migration was applied to prod manually, then this guard added to prevent recurrence.
52. Weekly Review task detail — clicking a task during the review now opens `TaskModal` (full untruncated notes + inline URLs clickable via `NotesLinks`), so notes/links can be checked before marking done/someday/delete. On save it patches just that task locally (no AI re-run, triage marks preserved); `TaskModal` now passes the saved task to `onSave` (backward compatible).
53. Inline note URLs clickable on cards — `TaskCard.parseNotes` now extracts URLs anywhere (not just whole-line), strips them from the line-clamped preview so text reads cleanly, de-dupes, and trims trailing sentence punctuation so links aren't broken. Applies to every task card (Lists/Dashboard/Review).
54. Friendly URL labels for task titles, app-wide — pasted URLs (in titles or notes) render as the registrable-domain label ("fireflies", "linear", "slack") instead of the raw URL, clickable (opens new tab), full URL on hover. Shared helpers `siteLabel` + `linkify` extracted to `client/src/lib/linkify.jsx` and applied to EVERY task-title surface (TaskCard, Today/Dashboard, Completed, Projects, Weekly Review stale/follow-up items, AI Assistant) so it's consistent everywhere. In-title URLs render as `<span role="link">` + `window.open` (valid inside the title `<button>`). Deliberately skipped: calendar blocks (drag conflict), custom-list reference items, editable title inputs.
55. Weekly Review "Get Creative" suggestions made actionable — `stale_items` (delete / move-to-someday) and `waiting_for_followups` ("take back" → next_actions) are one-click buttons that queue into the same `marked*` sets Step 2 uses and apply on Complete Review (nothing auto-executes — the AI only suggests). `projects_needing_attention` gets an "open →" deep-link to `/projects?project=<id>`; the Projects page reads that param, expands the project, then consumes it. Hint lines clarify the queue-then-apply model.
56. Mobile tap-to-open fix (RESOLVED) — on real touch devices, tapping a task title selected the title TEXT instead of firing the open-detail click ("text highlights, modal doesn't appear"); Chrome DevTools mobile emulation could NOT reproduce it (synthesizes mouse events). Added `select-none [touch-action:manipulation]` to the tap-to-open title buttons (TaskCard, Dashboard `FocusRow`, Projects). Compounded by stale-SW caching that masked several fixes until a manual cache clear — led to #57.
57. PWA update-flow hardening — `UpdatePrompt`'s `useRegisterSW` now re-checks for a new build on `visibilitychange`/`focus` (covers reopening an installed PWA) and every 30 min, instead of only at initial registration — so the "New version available" banner actually surfaces on long-lived sessions. Server now sends `Cache-Control: no-cache` for `sw.js`, the workbox runtime, `index.html`, `manifest.webmanifest`, and `registerSW.js` so the update-discovery files always revalidate (hashed assets keep immutable caching). Fixes repeated stale-cached-build incidents on mobile (previously only a manual "Clear & reset" worked). Existing devices need ONE manual clear to load this build; afterward updates propagate automatically.
58. Landing screenshot carousel (`fe66b33`) — replaced the 900px hero + 3-up thumbnail grid with one 1120px browser-framed crossfade carousel (‹ › arrows + dots + per-slide caption). Auto-rotates 6s, pauses on hover/focus + off-screen + hidden-tab, stops permanently after any manual interaction, respects `prefers-reduced-motion`; keyboard arrows + touch swipe. All 4 screenshots recaptured at 1600×1000 from the demo seed. Vanilla inline JS, no deps.
59. SEO + analytics groundwork (`057f25a` consent, `adcbfd3` canonicals, `cf39305` on-page) — cookie-consent banner + GA4 loader (`landing-page/consent.js`, gtag loads only after Accept, basic Consent Mode; **INACTIVE until real `G-XXXXXXXXXX` Measurement ID is set** — no-ops with the placeholder); self-referencing canonical tags added to the 3 legal pages (blog/index already had them; verified pages served via the Railway origin host still canonicalize to cleartable.app); meta descriptions trimmed to ≤160 chars across landing + 9 blog posts; og:locale/og:image:alt, WebApplication `screenshot` JSON-LD, footer "From the blog" internal links, sitemap `lastmod` bump. GSC + Bing both verified reading `sitemap.xml` (14 URLs). Lighthouse mobile baseline: perf 98 / SEO 100 / LCP 1.8s / CLS 0.
60. AI precision overhaul + GTD-coherence UX pass (`efa4f39` server, `1ed638e` client) — see `REVIEW_2026-07-03_AI_AND_UX.md`. Server: per-task temperature (0 for classification), `services/aiSchema.js` output validation + repair round-trip + truncation detection, priority-scale direction stated everywhere, plain-language reasoning, richer per-feature context (Daily Focus gets dates/overdue/load; Process Inbox gets projects/dates/history; Project Breakdown sees existing tasks; Weekly Review proposes someday_candidates), analyze-task + project-breakdown metered, unified 502/503 error contract, eval extended (96% on llama-3.3-70b). Client: focus concept unified to "Today", priority p1–p5 exposed in TaskModal, Inbox AI card processes inline, overdue rose cues, `listLabel()` helper, "done" not "shipped", Projects "needs next action" chip, first-run 3-step tour, AI-failure error toasts.
61. AI Mode dial — off/assisted/auto (`7a3adb9`, deployed same day) — one server-side `users.ai_mode` setting replacing the client-only Smart Capture routing preference (legacy `localStorage` key auto-migrates then deletes itself). `off` = the server itself refuses every AI call for that user (not just a hidden button) and every AI surface disappears client-side; `assisted` (new-user default) routes everything through the Inbox for confirmation; `auto` is the old confidence-gated behavior existing users were backfilled to. First-run tour now opens with a mode-choice question whose 3 cards double as the "how do I use this app" explanation, with tour copy tailored per mode. Two one-time Autopilot nudges (assisted-mode only, each fires at most once ever, server-timestamped): a 20-clean-accepts-in-a-row streak nudge (resets on any correction) and a 30-day/streak≥5 reminder. New `routes/preferences.js`, `services/userPrefs.js`, migration `1782600000000_ai-mode`. 502/503/429 AI errors now render as calm info toasts app-wide (`lib/aiError.js`) instead of alarming red ones.

---

## AI Quality Workstream

Cross-cutting effort to make AI suggestions more trustworthy. Insight from FEATURE_RESEARCH_2026.md: users abandon AI features after a single bad suggestion, so the goal is not "more AI" but "AI that is honest about what it doesn't know."

### Shipped
- **Confidence levels in every AI prompt** — `processInbox`, `importNotes`, `getDailyPriorities` now return `confidence: high|medium|low` per inferred field. Prompts include explicit rules ("prefer null + low over speculation") and warn against cross-item bleed (don't infer item N's project from item N-1).
- **Confidence-aware rendering** — Import Notes and Process Inbox cards hide low-confidence badges entirely and fade medium ones; high-confidence shows normally. Daily Focus shows a per-item confidence chip.
- **Inline-edit-everywhere on AI surfaces** — Import Notes and Process Inbox cards have a pencil → full editor (title, list, context, project, due date, energy, time, waiting-on, daily focus). User can fix wrong suggestions in place instead of hunting them down later.
- **Per-item prune on Daily Focus** — Each suggestion has a remove (X) toggle; "Set N as Today's Focus" only applies the kept ones.
- **Backend wired** — `/apply-inbox-processing` accepts the full editable field set (project_id, due_date, energy, time, daily_focus, waiting_for_person), mirroring `/apply-import`.
- **Few-shot from user history (Smart Capture)** — The user's 10 most recent classified tasks (title + final context + list) are injected into every Smart Capture prompt as a "USER'S RECENT CLASSIFICATIONS" block. AI mirrors the user's actual organization pattern instead of generic GTD defaults. Self-correcting: after the user manually fixes "call mom → Personal" twice, the AI sees it in history and stops suggesting @phone.
- **Life-domain context preference** — Smart Capture's prompt now distinguishes life-domain contexts (Personal/Work/Family/Home) from activity-type contexts (Phone/Computer/Errands) and ALWAYS prefers life-domain when both could apply. Fixes the "call mom → @phone" misclassification when the user has @Personal available.
- **Context management UI** — Settings → Contexts surface with add + delete (chips with X). Deletes are confirmed via ConfirmModal; existing tasks keep their tag, only the autocomplete suggestion is removed.
- **Confidence-gated routing on Smart Capture** — The AI returns `list_confidence: high|medium|low`. Server gates on the account's `ai_mode` (see AI Mode dial, feature #61 below): `auto` mode sends low-confidence tasks to Inbox even if AI guessed a list; `assisted` mode forces every Smart Capture task to Inbox regardless; `off` skips the AI call entirely. All other AI parsing (context, due date, project, energy, recurrence) is preserved — Inbox becomes a metadata-filled triage holding bay, not a re-do from scratch. Toast "Added to Inbox · AI wasn't sure where" makes the safety-net trigger visible.
- **Settings → AI mode selector** — Three-way choice (Off / Assisted / Autopilot) replacing the old two-way "Auto-route vs Always Inbox" radio. Persists server-side on `users.ai_mode`, so it's consistent across devices (superseded the old localStorage `smart_capture_routing` key, which auto-migrates on first load post-upgrade then deletes itself — see feature #61).
- **Anti-hallucination prompt rule** — Smart Capture prompt explicitly forbids inventing action verbs for noun-only inputs (e.g. "birthday gift" stays "birthday gift" instead of being cleaned to "Buy birthday gift"). Confidence is judged against the user's RAW input, not the cleaned title. Worked examples in the prompt: "birthday gift", "tax stuff", "follow up", "groceries" → LOW; "buy milk friday", "call mom tomorrow" → HIGH.
- **Learn from corrections** — Few-shot history query now orders by `updated_at DESC` instead of `created_at DESC`. When the user moves a task between lists or fixes its context, the task's `updated_at` is bumped (verified in `TaskModel.update`), so the corrected version surfaces in the next Smart Capture's prompt as a few-shot example. The AI learns from edits automatically — no separate correction-logging infrastructure needed.
- **Precision overhaul (2026-07-03, `efa4f39`; audit in `REVIEW_2026-07-03_AI_AND_UX.md`)** — deterministic sampling (temp 0 for classification), `aiSchema.js` output validation + one repair round-trip, priority-scale direction stated everywhere, plain-language reasoning, unified 502/503 error contract. Context enrichment: Daily Focus now sees due/overdue/start dates + today + time-blocked load; Process Inbox gets projects + dates + history; Smart Capture flags possible duplicates; Project Breakdown sees existing tasks + mode; Weekly Review labels truncation + proposes someday_candidates. analyze-task + project-breakdown now metered. Eval extended (priority + dup cases) → 96% on llama-3.3-70b.

### Next (in priority order)
1. **Capture corrections as an explicit diff log** — Today corrections surface implicitly via `updated_at` ordering on the few-shot history (good enough for Smart Capture). For Process Inbox + Daily Focus, an explicit "AI suggested X, user changed to Y" diff log would (a) enable richer few-shot prompting on those surfaces and (b) give us a quality metric to detect prompt drift.
2. **Single-item processing for Process Inbox** — Send each inbox item in its own API call rather than a batch. Eliminates the cross-item bleed problem at the API level (batching was the root cause of the "Courier Hub assigned to unrelated tasks" bug).
3. **Show "AI uncertain" affordance** — When AI returns mostly low confidence for an item, surface a hint ("AI wasn't sure about project + context") instead of silently hiding badges, so the user knows to check the editor.
4. **Confidence calibration check** — Track how often "high" suggestions get edited vs "low" ones. If high gets edited often, the prompt is overconfident — tune.
5. **Onboarding: seed default life-domain contexts** — New users start with an empty contexts table, so Smart Capture has no life-domain contexts to prefer and falls back to activity-type. Seed Personal / Work / Family / Home (or let the user pick from a recommended set) during first-run onboarding so the life-domain preference rule actually fires from day one. Cold-start fix for few-shot history.
6. **Spread few-shot to Process Inbox + Import Notes** — Currently history is injected only into Smart Capture. The same pattern should help the bulk-processing flows once they move to single-item calls (#2 above).
7. **Extract URLs from the title into notes (Smart Capture)** — Smart Capture currently keeps a pasted URL inside the action title (e.g. "Check https://app.fireflies.ai/"), so titles get cluttered with raw links. Prompt should strip the URL out of the title (clean action like "Check Fireflies") and let the URL live in notes, where it renders as a tidy clickable badge. Inline URLs are now clickable everywhere (title + notes) as a display fix (commit 53/title-linkify), so this is GTD-cleanliness polish, not a blocker. Needs prompt re-verification + an eval case so titles aren't over-trimmed.

---

## Known Issues (unresolved)

- **✅ [RESOLVED 2026-06-01] Mobile: tapping a task didn't open its detail (TaskModal).** Android Chrome, most visible in the Weekly Review. **Root cause:** on a real touch device the tap on the title text was a **text-selection gesture** ("text highlights, edit window doesn't appear"), so the title `<button>`'s click never fired. DevTools mobile emulation could NOT reproduce it (synthesizes mouse events). **Fix:** `select-none [touch-action:manipulation]` on the tap-to-open title buttons (`TaskCard`, Dashboard `FocusRow`, Projects). **Compounding factor:** the phone kept serving an old cached bundle, so several fixes appeared to "not work" until the service worker cache was cleared — see the open PWA-update item below.

- **🔧 [FIX SHIPPED, verify on phone] PWA update flow didn't reliably reach mobile.** The phone kept serving a stale cached build; reloads/logout didn't pick up new deploys — only a manual "Clear & reset" did. **Two causes addressed:** (1) `UpdatePrompt`'s `useRegisterSW` only checked for a new build at initial registration — added `onRegisteredSW` that calls `registration.update()` on `visibilitychange`/`focus` (covers reopening the PWA) and every 30 min, so the "New version available" banner actually surfaces on long-lived sessions. (2) The server now sends `Cache-Control: no-cache` for `sw.js`, `index.html`, the manifest, and the workbox runtime, so the browser always revalidates the update-critical files (hashed assets keep immutable caching). **Note:** because the OLD build is what's cached on existing devices, each device still needs ONE more manual clear/update to receive this fix — after that, future updates should propagate automatically. **Verify:** deploy a trivial visible change and confirm a phone picks it up on reopen/refresh without a manual cache clear.

---

## Build Backlog (Prioritized)

Features to build, ordered by impact and launch-readiness.

### P0 — Must-ship before public launch
| # | Feature | Why | Effort | Status |
|---|---------|-----|--------|--------|
| 1 | **Recurring tasks** | Table stakes — every competitor has it. Users can't manage real workflows without it. | Medium | **Shipped** |
| 2 | **Start/defer dates** | #1 GTD-specific request. Hide tasks until actionable. Core GTD philosophy. | Medium | **Shipped** |
| 3 | ~~**Migrate off sql.js**~~ | Server runs on Postgres via `pg` + `node-pg-migrate`. Docker Compose for local dev, Railway-managed PG in prod. Schema applied on both. Production user data was recovered from the legacy `/data/gtd.db` Railway volume via a temporary token-protected `/__recovery/gtd-db` endpoint (commit history entries 41-43). | High | **Shipped** |
| 4 | **AI usage metering + soft-throttle** | The "can't be negative" guarantee, and a prerequisite for #5. Per-user **daily** AI-call counter in Postgres (`ai_usage` table, one row per user/UTC-day); every AI call goes through `services/aiUsage.js`. Smart Capture over budget → degrades to **raw capture** (`throttled:true`); explicit AI actions (process-inbox, daily-priorities, import-notes, find-duplicates, weekly-review, custom-list extract-url) use `middleware/aiLimit.js` → **429 `daily_ai_limit`**. `GET /api/ai/usage` exposes `{tier,used,limit,remaining}`. **Enforcement ships OFF** — `AI_DAILY_LIMIT_FREE`/`_PRO` env, 0/unset = unlimited; counts in prod first so we calibrate the cap before turning it on. Tier resolver is a stub returning `free` until #5 adds `is_pro`. Fails open. | Medium | **Shipped** |
| 5 | **Payments / paywall (Paddle)** | Users currently have **no way to pay** — strategy exists (tiers in launch plan) but zero payment code in the repo. **Provider decided 2026-06-13: Paddle** (Merchant of Record — handles all EU/CZ VAT + global sales tax, since founder onboards as a CZ individual with IČO; chosen over Lemon Squeezy/Polar for cleanest flat 5%+50¢ all-in with no surcharge stacking, and over raw Stripe to avoid solo-founder VAT compliance). Build: `users` billing columns (`paddle_customer_id`, `paddle_subscription_id`, `plan`, `subscription_status`, `current_period_end`) + Paddle.js checkout + signature-verified webhook → `routes/billing.js`/`services/paddle.js` + wire `aiUsage.getTier()` to read plan + capacity gates at `ProjectModel/CustomListModel/HabitModel.create` + in-app upgrade/billing UI. **No lifetime deal.** Founder pre-sale = separate archived-after-launch price. Build against Paddle **sandbox** in parallel with live-account approval. Tier split below. | High | **Server + client built 2026-06-13/14 (sandbox-ready)**: migration, services/{paddle,billing}.js, routes/billing.js (+webhook), tier wiring, capacity gates, client Paddle.js + Settings→Billing UI (client build passes). Pending: finish Paddle dashboard (prices+webhook dest+domain approval), set env vars on Railway, deploy + end-to-end sandbox test, founder-cap enforcement, verify portal-session shape |
| 6 | **Legal pages (ToS / Privacy / Refund)** | **Hard gate for Paddle approval** — an MoR will not approve a site without them, and the refundable founder pre-sale needs a written refund policy. GDPR-aware (controller = individual w/ IČO; processors Railway, Groq, OpenAI, Google, Paddle). Drafted as static pages in `landing-page/`, linked from footer. **Needs human/legal review before publish.** | Low | **Drafted 2026-06-13** |
| 7 | **Email + password auth (non-Google users)** | App is Google-OAuth-only today. Public launch needs email/password sign-up + login (create password, reset flow) so non-Google users can pay & use the app. Blocks broad launch. | Medium | |
| 8 | **Welcome / onboarding wizard** | New users land in an empty app with no guidance — and Smart Capture's life-domain context preference can't fire with zero contexts (cold-start, see AI Quality Workstream #5). First-run wizard: seed default contexts (Personal/Work/Family/Home), explain capture → clarify → organize, optional demo seed. | Medium | **Shipped 2026-07-05**: full-screen 4-step `WelcomeOnboarding` modal over the app on first login (core loop → sidebar map → AI-mode dial → optional 5 sample tasks across Today/Inbox/lists), tracked server-side via `users.onboarded_at` (migration `1782700000000`, existing users backfilled) + `POST /preferences/onboarding-complete`; replaced the inline Dashboard mode-card + 3-step tour (`ct_tour_dismissed` localStorage retired). Default contexts were already seeded at signup in `auth.js` (cold-start fix landed earlier). E2E-verified via JWT-bypass + agent-browser. **LIVE on Railway 2026-07-05** (commit `4079000`; migration ran, all 4 prod users backfilled to onboarded, bundle hash + health confirmed). Wizard copy all lives in one component (`WelcomeOnboarding.jsx`). |
| 9 | **End-to-end flow test with AI disabled** | The app must remain fully usable with no AI (key unset, provider down, or Free user over the soft cap → raw-capture fallback). Manually verify every surface degrades gracefully (capture, inbox, lists, projects, review) before publish — AI is an enhancement, not a dependency. | Low | |
| 10 | **Fix landing page pricing** | Landing page (last touched 2026-05-17) predated the no-lifetime + final-pricing decisions: showed $80 lifetime + $30/yr Pro. Corrected to $36/yr · $4/mo Pro, $30/yr founder pre-sale (first 30 buyers, 30-day refundable), accurate Free/Pro split. Accurate displayed pricing is also a Paddle-approval requirement. | Low | **Fixed 2026-06-13** |
| 11 | **Habits overhaul** | Paid differentiator (capacity-gated 3 free → unlimited Pro), must feel first-class. **Researched 2026-06-17** (2 adversarial deep-research passes + code gap-audit; full findings + citations in FEATURE_RESEARCH_2026.md #7). **Current code:** scheduling (daily/weekly-X×/specific-days), binary check-off, 90-day heatmap, completion-rate + streak stats, categories/colors, static suggestions, Free=3 gate. **Streak/completion bug — FIXED & live 2026-06-18 (`5c43802`):** was counting consecutive *calendar* days (a 3×/week or specific-days habit could never hold a streak); now schedule-aware via exported helpers + 12 unit tests (`habits.js`, `npm run test:habits`). **P0 parity remaining:** measurable/quantitative habits (`habit_logs` has no value column — binary only); reminders. **P1 anti-guilt (on-brand, low-risk, confirmed demand):** skip/freeze/vacation days; flexible X-of-7 frequency goals with forgiving (non-resetting) streaks. **P2 depth:** quit/negative habits; notes per check-in; interval scheduling. **Differentiation bets (validate first — user demand UNPROVEN in research):** AI (NL setup, smart suggestions) + Google-Calendar habit scheduling (real market gap — only Reclaim does it, not a calm suite → build optional/suggestive). **Anti-features to AVOID:** punishing streak-resets/guilt, aggressive RPG gamification (Habitica), forced AI auto-scheduling. Overlaps recurring-task UX gap (#15). | Medium | **✅ P1 + P2 SHIPPED 2026-06-21** (all migrations verified on live local DB): streak bug fix (`5c43802`) · per-day skip/rest days (`24b62dc`) · interval scheduling (`79ecf64`) · quit habits (`e494dba`) · per-habit calendar popover (`1824f28`, + portal bug fix `1a75368`) · vacation/rest-day ranges (`a6dfc8c`) · notes per log (`19efc86`) · calendar select/state decouple (`b54f47f`). `habit_logs` gained `status`+`note`, `habits` gained `type`; frequency gained `interval`. **Only remaining = the bet:** AI + Google-Calendar habit scheduling — **validate-first** (research inconclusive on demand AND trust; build optional/suggestive only after a review-mining pass). Measurable/quantitative habits + reminders also still unbuilt (were P0-parity). |
| 12 | **Google OAuth app verification (publish consent screen)** | **Hard pre-publish gate.** App sign-in is currently gated by the Google OAuth consent screen being in **"Testing"** mode — only whitelisted **Test users** can sign in (cap 100 lifetime; 4 added as of 2026-06-14: doujohn09@gmail.com, jan.bambas@rohlik.cz, jiri.frank.88@gmail.com, theliau.bevilacqua@rohlik.cz). This is the *only* access gate — `auth.js` has **no app-level allowlist** and auto-creates an account for any authenticated Google user. Going public = **Publish app → production**, which triggers **Google's verification review** because the app requests the **sensitive Calendar scope** (`googleCalendar.js`): requires published Privacy Policy + ToS (#6), a verified domain (`cleartable.app`, now live on Cloudflare→Railway), a homepage, and a review that can take **days–weeks**. Until verified, non-whitelisted users are blocked and see an "unverified app" warning. **Start the review well before launch day.** Landing page (`cleartable.app/`) is already public; only `/app` sign-in is gated. | Medium | **Identified 2026-06-14 — in Testing mode (4 test users); review not started** |

**Free / Pro tier split** (decided 2026-05-31; pricing decided 2026-06-11: **$4/mo · $36/yr list, $30/yr refundable founder's pre-sale at launch** — see Pricing Strategy):
- **Free:** core GTD (inbox, projects, contexts, recurring, defer, calendar) · saved filters · **8 projects** · **1 custom list** (tease) · **3 habits** (tease) · AI capture with a low soft daily cap → raw manual fallback.
- **Pro:** unlimited projects / custom lists / habits · **analytics dashboard** (#8, hard-walled — purely retrospective, no activation cost) · much higher AI soft cap.
- Gating principle: **wall "looking-back" features (analytics), capacity-gate "coming-back" features (habits, lists)** so free users taste the value and hit the ceiling as commitment grows. Saved filters stay free (basic refinement of core). #12 (free AI provider) makes even the Pro cap cheap and is what makes the economics safe.

### P1 — High impact, build before or shortly after launch
| # | Feature | Why | Effort | Status |
|---|---------|-----|--------|--------|
| 4 | ~~**PWA support**~~ | `vite-plugin-pwa` (Workbox SW + manifest + autoUpdate). App icons generated from brand identity. iOS Add-to-Home-Screen meta tags. Installable on Chrome, Edge, Safari iOS, Safari macOS. | Low | **Shipped** |
| 5 | ~~**Calendar time blocking (Phase 3)**~~ | Drag tasks onto time slots, snap, resize, push to dedicated Cleartable calendar. | High | **Shipped** |
| 6 | ~~**AI-assisted scheduling (Phase 4)**~~ | Smart Capture detects free-slot intent and books first open window inside working hours. | Medium | **Shipped (MVP)** |
| 7 | **Saved filters / custom views** | Power user perspectives: "high-energy @office tasks due this week". OmniFocus killer feature. | Medium | |
| 8 | **Productivity analytics dashboard** | Completion rates, streaks, time trends, project velocity. Users want to see progress. | Medium | |
| 9 | **AI Daily Planning — "plan my day" ritual** | **The conversion bet (decided 2026-07-06).** One tap turns Today into a realistic time-blocked plan around real calendar + energy/estimates, and defers what doesn't fit ("protects your day" — counter-positioned vs Motion/Reclaim's anxious cramming at 5–8× lower price; category willingness-to-pay is proven at $10–34/mo). Assembles from shipped parts: scheduling.js free-slot logic, daily-priorities op, GCal read/write, time-blocking UI. 3 slices: plan-my-day (new `plan-day` AI op + `daily_plans` table + review panel), morning brief (deterministic, no AI call), evening shutdown. Free = 3 plans/month, Pro = daily (the visceral upgrade trigger). Full build plan: **DAILY_PLANNING_PLAN.md**. | Medium-High (5–7 sessions) | Planned |

### P2 — Differentiators, build when core is solid
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 9 | **Built-in Pomodoro timer** | Low effort, high perceived value. TickTick's is "oddly effective." | Low |
| 10 | **Recurring task flexibility** | Beyond current recurrence: "every 3rd weekday", "2 days after completion" (relative recurrence shipped, advanced patterns remaining). | Medium |
| 11 | **Task dependencies (cross-project)** | "Task B blocked by Task A" beyond sequential projects. | Medium |
| 12 | **Free AI provider backend (latency + cost win)** | **Phase 1 shipped 2026-05-31:** Smart Capture now runs on **Groq Llama-3.3-70B** (chosen over Gemini because Gemini's free tier trains on inputs — unacceptable for private task content; Groq doesn't). Provider abstraction + per-task routing + **auto-fallback to OpenAI** on error/rate-limit/JSON-parse-fail live in `ai.js`. Eval (`scripts/eval-smart-capture.mjs`, 22 cases): **quality parity 32/32 both models**; real latency **~830ms Groq vs ~3540ms gpt-4o-mini (~4x faster)**. Free-tier 30k TPM throttles under burst → falls back to OpenAI (consider Groq paid tier or trimming the 2451-token prompt at scale). **Phase 2 shipped 2026-05-31:** all heavy ops routed through `complete()`; eval (`scripts/eval-heavy-ops.mjs`) showed **schema validity 100% on both models incl. the nested weekly-review schema** + objective-task parity. Migrated to Groq the **objective ops** (process-inbox, import-notes, find-duplicates, url-extract); **kept advisory ops on gpt-4o** (weekly-review, project-breakdown, analyze-task, daily-priorities) — structural parity proven but advice *quality* unverified, and they're a natural Pro-tier lever. Groq client hardened with `timeout:15000` after a free-tier throttle-STALL held a request 343s in the eval (SDK default timeout is 10min). Flipping an advisory op to Groq is now a one-line `ROUTING` change. | Medium |
| 13 | **MCP server + flagship agent** | Niche but tweetable launch differentiator ("the GTD app with MCP"). Audience is r/ClaudeAI, HN, AI productivity X — small but high signal-to-size, and competitors won't ship this in 2026. Ship MCP as plumbing + 1–2 polished agents (e.g. weekly-review agent, morning-prep agent) as the headline. Start with local stdio (`npx @cleartable/mcp`, ~1–2 days), then optional remote HTTP at `mcp.cleartable.app`. Hard part: bearer-token auth (current API uses session cookies). | Medium |
| 14 | **Smart Capture two-stage save (true zero-latency)** | Follow-up to fire-and-forget capture (shipped 2026-05-21). Insert the raw text into the inbox synchronously (~50ms) and return; enrich with AI (context, list, due_date, project) in the background and patch the row in place. Task appears in inbox immediately as raw text, then "shape-shifts" to its enriched form ~1–2s later. Pairs well with the Groq/Gemini swap (#12) — both attack the same UX axis. | Medium |
| 15 | **Recurring task UX clarity** | Three related polish items surfaced by the 2026-05-20 bug report ("a task I deleted came back"): (a) completion toast for recurring tasks should mention next occurrence ("Done · next on Mar 27"), (b) bigger / clearer recurrence badge on the task card (currently 10.5px violet icon, easy to miss), (c) audit Smart Capture's recurrence detection — gpt-4o-mini may be setting `recurrence_rule` on inputs without explicit recurrence wording. Build a 20-task eval set when touching the prompt. | Low |
| 16 | **People / mentions on tasks** | Surfaced 2026-06-04: AI tagged a task "👤 Christian" via `waiting_for_person` because the input said *"from Christian"* — attribution, not delegation. Prompt now tightened to fire only on genuine "waiting for X" language (commit this session). The **accidental discovery is the feature idea**: people are a natural cross-cutting dimension of tasks. Two scopes — (a) **narrow:** a proper `requested_by` / "from" field distinct from `waiting_for_person` (who asked vs who you're blocked on); (b) **broad:** detect *any* person name mentioned in a task, store as structured mentions, and let users **filter/group tasks by person** ("everything involving Christian"). Broad version pairs with saved filters (#7) and an eventual People view. Watch for: name-detection false positives (places, products), privacy framing, and that `waiting_for_person` is currently only editable in the modal when `list === 'waiting_for'` (badge shows regardless — a UI inconsistency to resolve if this grows). | Medium |
| 17 | **AI suggest — reasons + "AI priority" sort (focus toolbar follow-ups)** | Deferred while building the inline AI-reorder on the Dashboard focus toolbar (2026-06-30). Two ideas parked: **(B) inline suggestion panel** — instead of (or in addition to) the silent reorder, expand a panel under the toolbar showing the AI's recommended top-N *with one-line reasons*, then Apply / Dismiss; gives transparency into *why* these rose to the top. Could land as a hover/expand on the AI button rather than a full panel. **(C) "✨ AI priority" as a sort option** — fold AI ranking into `SortDropdown` (`sortTasks`) as a first-class sort value rather than (or alongside) a standalone button; conceptually honest since it *is* a ranking, removes a toolbar control. Caveat noted at decision time: an async AI call hidden inside a sort dropdown is surprising, and it loses the prominence of a dedicated button — so it was not chosen for v1. | Low |

### P3 — Future / after product-market fit
| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 13 | **Collaboration & shared lists** | Couples, families, small teams. Different market — build only with clear demand. | High |
| 14 | **Voice-first task capture** | Speech → organized tasks. Growing trend but niche. | Medium |
| 15 | **Integrated notes & journaling** | Rich notes alongside tasks. Notion territory. | High |
| 16 | **Gamification** | XP, rewards, streaks for tasks. Risky if poorly designed. | Medium |
| 17 | **ADHD-friendly design** | Visual timers, low-overwhelm UI, gentle nudges. Great niche but needs research. | Medium |
| 18 | **Self-hosted / privacy-first** | Local-only data, no cloud. Growing demand from r/selfhosted. | High |
