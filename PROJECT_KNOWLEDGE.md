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
- **tasks** — `id`, `title`, `notes`, `list` (inbox|next_actions|waiting_for|someday_maybe|completed), `context`, `project_id`, `waiting_for_person`, `due_date`, `energy_level` (low|medium|high), `time_estimate`, `priority`, `is_daily_focus`, `completed_at`, `user_id`, `created_at`, `updated_at`
- **projects** — `id`, `name`, `description`, `status` (active|completed|on_hold), `outcome`, `user_id`, `created_at`, `updated_at`
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
- **Projects** — Multi-task outcomes with status tracking

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

### Other
- **Habit Tracking** — Daily/weekly habits with streak tracking and calendar view
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

### Contexts: `/api/contexts`
- `GET /`, `POST /`, `DELETE /:id`

### Habits: `/api/habits`
- `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`
- `POST /:id/log`, `DELETE /:id/log`
- `GET /summary` — Streak and completion stats

### AI: `/api/ai`
- `POST /process-inbox` — AI inbox processing
- `POST /apply-suggestions` — Apply AI inbox suggestions
- `POST /daily-focus` — AI daily priorities
- `POST /import-notes` — AI note categorization
- `POST /apply-import` — Apply imported notes
- `POST /find-duplicates` — AI duplicate detection
- `POST /apply-duplicates` — Remove selected duplicates

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
- **AI-powered features** (inbox processing, duplicate detection, daily focus — most competitors don't have this)
- **Built-in habit tracking** (only TickTick does this among competitors)
- **Modern UI with dark mode** (FacileThings and Nirvana feel dated)
- **Energy levels & time estimates** on tasks

### Potential Future Features to Close Gaps
- Sequential/parallel projects
- Defer/start dates
- Weekly review workflow
- Mobile apps (React Native or PWA)
- Collaboration/sharing
- Integrations (calendar, email, Slack)

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
