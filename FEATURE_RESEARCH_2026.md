# Productivity App Feature Research: What Users Want Most (2025-2026)

*Research conducted April 2026 across Reddit, Facebook, review sites, comparison articles, market analyses, and user surveys.*

---

## Part 1: Top Communities Where Users Discuss Productivity Apps

### Reddit (the primary hub for feature discussions)

| Subreddit | Members | Focus |
|-----------|---------|-------|
| r/productivity | ~3.7M | Main hub for app discussions |
| r/GetDisciplined | ~1.2M | Routines, habits, discipline |
| r/ADHD | ~1.5M | Neurodivergent productivity (rich source of UX feedback) |
| r/organization | ~1.2M | Physical and digital workspace organization |
| r/Notion | ~400K | Notion workflows |
| r/selfhosted | ~400K | Privacy-first, self-hosted tools |
| r/ObsidianMD | ~200K | PKM + task management |
| r/digitalminimalism | ~200K | Intentional tech use, simple tools |
| r/ZenHabits | ~160K | Simplicity, mindfulness in routines |
| r/bujo | ~100K+ | Bullet journaling (analog/hybrid productivity) |
| r/todoist | ~100K+ | Most active app-specific subreddit |
| r/gtd | ~80K | GTD methodology |
| r/ticktick | ~30K+ | TickTick features & comparisons |
| r/ProductivityApps | ~30K+ | App recommendations and reviews |
| r/PKMS | ~30K+ | Personal knowledge management systems |
| r/omnifocus | ~15K+ | OmniFocus, deep GTD |
| r/thingsapp | ~15K+ | Things 3 workflows |

**Key finding:** Reddit is where real feature debates happen. Subreddits like r/productivity, r/todoist, r/gtd, and r/ADHD contain far more detailed feature discussions than any other platform. Reddit's 75M+ weekly direct searches make it the dominant platform for productivity tool discovery.

**Notable non-Reddit communities:** Hacker News, GTD Forums (forum.gettingthingsdone.com), OmniGroup Discourse forums, and the Obsidian Forum.

### Facebook (dominated by Notion)

| Group/Page | Members | Focus |
|------------|---------|-------|
| Notion Vietnam | ~238K | Largest regional Notion group globally |
| Getting Things Done (official page) | ~87K | GTD methodology |
| Notion Made Simple | ~69K | Notion workflows, Q&A |
| Todoist (official page) | ~36K | Todoist |
| Notion for Students | ~30K | Academic productivity |
| The Omni Group (official page) | ~9.5K | OmniFocus |
| Notion for Business | ~7.3K | Business-oriented Notion |
| Notion Tips & Templates | ~6.7K | Template sharing |
| Notion Hacks and Systems | ~6.6K | Tips, tricks, system design |
| No Cost Notion Templates & Tools | ~4.3K | Free templates |
| All Things Notion | ~3.7K | General Notion community |
| Notion for Family | ~3.7K | Family workspace design |
| ADHD & Notion | ~2.8K | Notion for neurodivergent users |
| Minimalist Notion | ~2.5K | Minimalist approaches |
| Notion for Solopreneurs | ~1.4K | Solo entrepreneur workflows |
| Building a Second Brain | Large | PKM, PARA method |
| Productive For Life | Unknown | Online entrepreneurs |
| Habits, Productivity, And Time Management | Unknown | General productivity |
| Work Life Harmony | Unknown | Work-life balance |

**Key finding:** Facebook's productivity community is dominated by Notion, with 12+ dedicated groups and 100K+ combined members. No other single productivity app has this level of Facebook group activity. Todoist, TickTick, OmniFocus, and Things users primarily congregate on Reddit and official forums.

---

## Part 2: Top 20 Most Requested Features (Ranked by Cross-Community Frequency)

### Tier 1 — Universal Demands (mentioned everywhere, repeatedly)

#### 1. Calendar Integration & Time Blocking
The single most requested feature across the ecosystem. Users overwhelmingly want to see tasks and calendar events on the same screen, drag tasks into time slots, and time-block their day without switching apps. Todoist called their calendar view "maybe the most requested piece of the calendar puzzle so far." Apps without this are increasingly seen as incomplete.

**GTD Flow status:** Partial (Phase 1-2 complete: calendar view with month/week/day + Google Calendar sync. Phase 3-4 time blocking not yet implemented)

#### 2. Start Dates / Defer Dates
One of the most persistent feature gaps across major apps. Users want to set a date when a task becomes relevant (not just when it's due), and have it hidden until that start date arrives. OmniFocus has had this for years ("defer dates"). Todoist only partially addressed it with their 2025 "Deadlines" feature. True start dates that hide tasks remain one of the most persistent requests.

**GTD Flow status:** ✅ Implemented (tasks hidden from active lists until start_date, deferred toggle chip on each list view to reveal/edit)

#### 3. Natural Language Input for Task Capture
Users expect to type "call John next Monday at 2pm p1" and have the app parse the task, date, time, and priority automatically. This is cited as the #1 thing users miss when switching away from Todoist. Speed of task capture directly correlates with whether people actually use the app consistently.

**GTD Flow status:** Implemented (Smart Capture with GPT-4o-mini — parses dates, contexts, priority, energy, project matching, personal/work detection)

#### 4. Cross-Platform Sync & Availability
Tasks must follow users across iPhone, Android, Mac, Windows, web, and ideally watch/tablet. Sync must be fast and reliable. Apps that are platform-exclusive (Things = Apple only, OmniFocus = Apple only) lose large user segments. This is among the top deal-breakers.

**GTD Flow status:** Partial (web-only currently)

#### 5. Task Dependencies & Sequential Projects
The ability to mark that Task B cannot begin until Task A is completed. This is standard in project management tools (ClickUp, Asana) but missing from most personal task managers. Users managing multi-step projects consistently request this.

**GTD Flow status:** Partial (sequential projects exist, but no cross-project dependencies)

#### 6. Quick Capture / Frictionless Task Entry
The app must make adding a task nearly instantaneous — keyboard shortcuts, natural language processing, voice input, share-sheet integration, global hotkeys. Speed of capture is the single biggest predictor of sustained app usage.

**GTD Flow status:** Partial (Quick Capture exists but web-only)

### Tier 2 — High-Demand Differentiators

#### 7. Built-in Habit Tracking
Users want habit tracking alongside their task lists rather than in a separate app. TickTick is the only major todo app with robust built-in habit tracking. Consistently cited as why users choose TickTick over Todoist.

**GTD Flow status:** Implemented

#### 8. Weekly Review Workflow
The weekly review is "where GTD lives or dies." OmniFocus is the only major app that bakes this into the interface. Users of other apps consistently request structured review modes that walk them through stale projects, overdue items, and inbox processing.

**GTD Flow status:** Implemented (4-step wizard with AI insights — only OmniFocus also has this)

#### 9. AI-Powered Scheduling & Prioritization
Auto-scheduling tasks based on priorities, deadlines, capacity, and calendar availability. Motion pioneered this. However, users are skeptical of AI that adds complexity — they want AI that "reduces friction, not reinvents processes." This is divisive: many power users see AI task breakdown as "a way to procrastinate."

**GTD Flow status:** Partial (Daily Focus AI exists, no auto-scheduling into calendar)

#### 10. Built-in Pomodoro / Focus Timer
TickTick's Pomodoro timer is described as "oddly effective — like tricking your brain into beginning." Users want focus tools integrated into their task manager, not as a separate app.

**GTD Flow status:** Not implemented

#### 11. Offline Support & Local-First Data
Growing frustration with cloud-only apps that fail without internet. Privacy concerns drive demand for local storage, self-hosting, and no telemetry. 7% of analyzed Reddit posts specifically requested offline-first tools. 90% of new apps are projected to incorporate on-device AI by 2026.

**GTD Flow status:** Not implemented

#### 12. Custom Views / Saved Filters / Perspectives
Power users want saved views combining multiple criteria (labels, priorities, dates, projects, contexts). OmniFocus perspectives are a "killer feature for power users." Todoist filters partially address this but are more limited.

**GTD Flow status:** Not implemented

#### 13. Collaboration & Shared Lists
Share projects/lists, assign tasks, communicate within the app. Things 3 and OmniFocus have zero collaboration — a deal-breaker for teams/couples/families. Shared grocery lists and household chores are a massive use case.

**GTD Flow status:** Not implemented (in backlog)

#### 14. Recurring Task Flexibility
Advanced recurrence beyond "every Monday" — "every 3rd weekday," "2 days after completion," preset options. Users want both "absolute" recurrence (same date regardless) and "relative" recurrence (based on completion date).

**GTD Flow status:** ✅ Implemented (daily/weekdays/weekly/monthly/yearly/custom with specific days + interval, absolute and relative recurrence types. On completion, creates completed snapshot and advances original task's dates)

### Tier 3 — Growing Demand / Emerging Trends

#### 15. Integrated Notes & Journaling
Users want rich notes, daily journaling, and reference material alongside tasks. NotePlan, Amplenote, and Notion are praised for this. Todoist and TickTick have limited note-taking.

**GTD Flow status:** Not implemented

#### 16. Gamification, Streaks & Rewards
Streaks, XP points, avatar progression, accountability mechanisms. Habitica pioneered full RPG mechanics. Users with ADHD especially value dopamine-driven feedback loops. Poorly designed gamification can backfire.

**GTD Flow status:** Partial (habit streaks exist, no task gamification)

#### 17. Energy/Capacity-Aware Scheduling
Scheduling tasks based on energy levels and cognitive capacity. Integration with wearables for biometric data. Described as "table stakes for serious productivity tools by 2026."

**GTD Flow status:** Partial (energy levels exist on tasks, not used for scheduling)

#### 18. ADHD-Friendly / Neurodiversity Design
Features addressing time blindness, task initiation difficulty, executive function challenges. Visual timers, task-as-playlist formats, adjustable task breakdown, low-overwhelm interfaces. Amazing Marvin is consistently called "the best todo app for ADHD." The r/ADHD community is one of the richest sources for product ideas.

**GTD Flow status:** Not specifically addressed

#### 19. Productivity Analytics & Insights
Completion rates over time, project velocity, what days/times users are most productive, historical trends. Most todo apps provide minimal analytics. Users feel "every task assigned a duration and completed should be tracked."

**GTD Flow status:** Partial (weekly review stats, no detailed analytics dashboard)

#### 20. Voice-First Task Capture
Speech as primary interaction. Todoist's "Ramble" (Jan 2026) turns unstructured speech into organized tasks. Users want this for driving, exercising, and accessibility.

**GTD Flow status:** Not implemented

---

## Part 3: What Makes Users Switch Apps (Deal-Breakers)

1. **Price hikes** — Todoist's 25-40% increase (Dec 2025, $48/yr to $60/yr) drove significant switching. Users feel task management apps should not cost $7/month. TickTick at $36/yr is now a competitive talking point.
2. **Buggy sync / app crashes** — The #1 technical deal-breaker. If tasks don't appear on all devices reliably, users leave.
3. **Platform lock-in** — Apple-only (Things, OmniFocus) immediately disqualifies for many users.
4. **Missing one critical feature** — Users tolerate many gaps but have individual deal-breakers (no calendar, no start dates, no offline).
5. **Over-complexity** — OmniFocus and Notion are abandoned for being "a project in themselves." Users spend more time configuring systems than completing work.
6. **Under-complexity** — Apple Reminders and Google Tasks are outgrown when users need filters, subtasks, or integrations.
7. **Anxiety-inducing UI** — Overdue badges, red highlights, and constant deadline pressure cause users to avoid opening the app entirely. Creates "a mountain of shame" and an "UGH field."
8. **Subscription fatigue** — Things 3's one-time purchase ($80) is increasingly attractive. Open-source tools gaining traction.
9. **App stagnation** — Slow development frustrates loyal users (Things 3, NirvanaHQ cited).
10. **The "three-app problem"** — Needing separate apps for tasks + notes + calendar creates fragmentation fatigue, driving users toward all-in-one solutions or paradoxically back to a plain .txt file.

---

## Part 4: Notable User Quotes & Sentiments

**On app-switching exhaustion:**
> "If you can't get things done with Todoist, TickTick isn't likely to magically solve your problems, and vice versa. Whichever app you go with, mastering its tools and understanding its quirks is likely to get you further than constantly swapping between apps."

**On backlog anxiety:**
> "The biggest killer for any task tracker I find is an accumulating backlog." Tasks piling up creates "a mountain of shame" that builds an "UGH field" making users not want to open the app at all.

**On the return to simplicity:**
> A developer's journey through Notion, Todoist, Things 3, OmniFocus, and Trello led back to a simple .txt file, citing "instant access, searchability, permanence, and freedom from vendor lock-in."

**On the "perfect app" myth:**
> "Productivity porn is Reddit catnip. We're all convinced that the right system will finally make us organized, motivated, and successful."

**On feature creep:**
> "Most productivity apps suffer from feature creep — they start simple but gradually add calendars, teams, AI assistants, notifications, analytics, and eventually become the very complexity they promised to solve."

**On ADHD-specific needs:**
> The r/ADHD community "provides detailed descriptions of broken workflows" and "clearly explains why existing tools fail," making it one of the richest sources for product ideas.

**On AI skepticism:**
> Users want AI that "reduces friction, not reinvents processes." AI task breakdown is seen by some as "a way to procrastinate" by ticking off meaningless sub-tasks.

---

## Part 5: GTD Flow Competitive Position

### Already Strong (validated differentiators)
- **AI-powered features** — Most competitors don't have this. Inbox processing, duplicate detection, daily focus, and weekly review AI are exactly what users ask for.
- **Weekly Review workflow** — Only OmniFocus has this among competitors. Users call it "where GTD lives or dies."
- **Built-in habit tracking** — Only TickTick does this among major competitors.
- **Sequential/parallel projects** — Only OmniFocus matches this.
- **Energy levels on tasks** — Almost no competitor has this.
- **Web-based & cross-platform potential** — Unlike Things/OmniFocus (Apple-only).
- **Distinctive UI** — Bespoke neo-modern glass aesthetic (Aurora gradient, frosted cards, Instrument Serif + Geist Mono); FacileThings and Nirvana feel dated, most competitors use generic shadcn-style defaults.

### Highest-Impact Features to Add

#### High Priority
1. ~~**Start/defer dates**~~ — ✅ Shipped 2026-04-22. Tasks hidden until start_date, deferred toggle chip on each list view.
2. **Calendar integration & time blocking** — Most requested feature ecosystem-wide. Phase 1-2 shipped (calendar view + Google Calendar sync). Phase 3-4 (time blocking + AI scheduling) remaining.
3. ~~**Recurring tasks**~~ — ✅ Shipped 2026-04-22. Daily/weekdays/weekly/monthly/yearly/custom, absolute and relative recurrence.
4. ~~**Natural language input**~~ — ✅ Implemented as Smart Capture (GPT-4o-mini)
5. **PWA / offline support** — Installable web app with offline capability. Addresses both mobile and offline without native apps.

#### Medium Priority
6. **Built-in Pomodoro timer** — Low complexity, high perceived value.
7. **Saved filters / custom views** — Perspectives for power users.
8. **Productivity analytics dashboard** — Completion rates, streaks, time trends, project velocity.
9. **Task dependencies (cross-project)** — Beyond sequential projects.
10. **Collaboration & shared lists** — Family, team, couple use cases.

#### Lower Priority / Emerging
11. **Voice-first task capture**
12. **Integrated notes & journaling**
13. **Gamification** — XP, rewards for task completion
14. **ADHD-friendly design** — Minimal clutter, visual timers, gentle nudges
15. **Self-hosted / privacy-first option**

---

## Part 6: Market Data

- Productivity apps market: **$13.15B in 2025**, projected **$30.85B by 2034** (9.94% CAGR)
- **83%** of professionals use AI tools daily for productivity
- Workers using AI assistants report **52% higher output**
- Knowledge workers toggle between apps **~1,200 times/day**, costing ~4 hours/week
- **55%** say multiple unintegrated apps increase distractions
- **28%** cite privacy/security as limiting adoption
- Gartner predicts **40%** of enterprise apps will have task-specific AI agents by end of 2026 (up from <5% in 2025)
- Digital wellness features saw **156% adoption growth**
- **47%** of users say poor app performance hurts work productivity
- **Over 50%** of workers report feeling overwhelmed by their workload

---

## Part 7: AI Quality & Trust — Strategy Menu (added 2026-04-19)

The single biggest risk to AI features in productivity apps is wrong suggestions. Part 4 quotes ("AI that reduces friction, not reinvents processes") and Part 3 deal-breakers (loss of trust → abandonment) both confirm: one bad suggestion can permanently damage the user's willingness to engage with AI. This section captures what causes AI to be wrong in our app and the full menu of strategies considered.

### Diagnosed root causes (from real bug investigation)

**1. Cross-item bleed in batched prompts.** When `processInbox` and `importNotes` send all items in a single API call, the model treats neighboring items as context. Real example: an unrelated task got assigned to project "Courier Hub" purely because a sibling item in the same batch mentioned it. This is the dominant accuracy bug in batched AI features.

**2. No abstention mechanism.** Without a "don't know" option, the model fills every field with its best guess. A wrong guess looks identical to a confident answer in the UI — the user can't distinguish.

**3. Generic prompt, no user history.** AI doesn't know that *this user* always tags reports as @work and uses "Q3 Roadmap" not "q3 roadmap" — it has to guess fresh every time.

**4. Cold-start, no feedback loop.** When a user edits an AI suggestion before applying, that correction is thrown away. The model never learns from it.

### Full strategy menu (with effort/impact)

| # | Strategy | Effort | Impact | Notes |
|---|----------|--------|--------|-------|
| 1 | **Confidence + abstention** in prompts (high/medium/low per field) | Low | High | Foundation for everything else. Lets the UI hide bad guesses. **Shipped 2026-04-19.** |
| 2 | **Hide low-confidence output** in the UI; fade medium | Low | High | Pairs with #1. Trust is built by AI staying silent when uncertain. **Shipped 2026-04-19.** |
| 3 | **Few-shot from user history** — inject 5–10 of user's recent processed tasks | Medium | High | Personalizes context detection, project matching, energy/time estimates. Likely the biggest accuracy win after #1+#2. |
| 4 | **Capture corrections** — log every original→edited diff before apply | Medium | Medium | Becomes the corpus for #3 and a quality metric (high-confidence edit rate). |
| 5 | **Inline edit everywhere** — let users fix wrong suggestions in place | Medium | High | Doesn't make AI smarter, but reduces the cost of being wrong from "go hunt the task in another list" to "click pencil." **Shipped 2026-04-19.** |
| 6 | **Single-item processing** for inbox (one API call per item) | Medium | High | Eliminates #1 (cross-item bleed) at the API level. Tradeoff: more API calls = more cost + slower for large inboxes. |
| 7 | **Two-pass review** — second model call critiques the first | Medium | Medium | Expensive but catches obvious errors. Better invested in #3 first. |
| 8 | **Model upgrade per surface** — use GPT-4o for high-stakes (project matching), keep mini for cheap tasks | Low | Medium | Already partially done (Smart Capture uses mini, Process Inbox uses 4o). Worth re-auditing once #1–#5 ship. |

### Decision (2026-04-19)

Ship #1, #2, #5 first as a foundation. They're cheap, they reduce blast radius of wrong AI immediately, and they unblock the rest:
- #3 needs the corrected-task corpus that #4 will produce, which needs #5 to be the place where corrections happen.
- #6 needs the confidence schema from #1 to make per-item routing decisions.

Next planned: #6 (single-item inbox), then #4 + #3 together (capture corrections, then few-shot from them).

### Connection to user research

Part 4 quote: *"AI that reduces friction, not reinvents processes."* The confidence-first strategy is the operational version of this — the AI does less when it's not sure, and the user does more (via inline edit). This is the opposite of Motion's "auto-schedule everything" approach that many users explicitly distrust.

---

## Sources

### Review & Comparison Sites
- Zapier: Best To-Do List Apps 2026, Why You Hate Every To-Do App, TickTick vs Todoist
- Efficient App: Best To-Do List Apps 2026
- ToolFinder: Best To-Do List Apps 2026, Best GTD Task Management Apps
- Rivva: Todoist vs Things vs TickTick, Best Productivity Apps 2026
- Any.do: Best Todoist Alternative 2026
- Morgen: TickTick vs Todoist 2026
- Merazoo: OmniFocus Review 2026
- Asian Efficiency: Best GTD Apps 2026
- Lovable: Best GTD Application
- SingleFocus: Best GTD App 2026
- Nathan Ojaokomo: Best To-Do List Apps 2026

### Market & Trend Analysis
- Fortune Business Insights: Productivity Apps Market Forecast
- Business of Apps: Productivity App Revenue and Usage Statistics
- The Business Dive: Productivity Apps Statistics
- NicheMetric: Productivity App Market Overview 2026
- Forem: 7 Productivity App Trends in 2026
- ProductivityHub: 2025 Productivity Statistics
- Gartner: AI Agents Prediction 2026

### Community Sources
- Reddit: r/productivity, r/todoist, r/gtd, r/omnifocus, r/ticktick, r/thingsapp, r/ADHD, r/selfhosted, r/Notion, r/ObsidianMD
- Hacker News: "I tried every todo app" discussions, Ask HN threads
- Facebook: GTD official page, Notion groups, Todoist page
- GTD Forums (forum.gettingthingsdone.com)
- OmniGroup Discourse forums
- Quora: Biggest Problems with Todo Apps

### App-Specific
- Todoist: 2025-2026 Changelogs, Pricing Update
- Android Authority: Todoist Price Hike Alternatives
- Motion: Todoist vs TickTick comparison
- Self-Manager: Top 10 Task Managers Redditors Recommend 2026
- Akiflow: AI Productivity Hype vs Reality
- DEV Community: Open-Source Productivity Apps Comparison

### Other
- LinkedIn: "I Stopped Using Mainstream Todo Apps"
- The Sweet Setup: Things vs OmniFocus vs Todoist
- Microsoft Community: ToDo Missing Features
- nomusica.com: Reddit Analysis — What Users Want From Apps 2026
