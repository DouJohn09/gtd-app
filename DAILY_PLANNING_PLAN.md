# AI Daily Planning — Build Plan

*Drafted 2026-07-06. The bet: the one killer feature that converts — a calm "plan my day" ritual that turns Today into a realistic time-blocked schedule around the user's real calendar, and tells them what NOT to do today. Counter-positioned against Motion/Reclaim (anxious cramming) at 5–8× lower price; the demonstrated willingness-to-pay in this category is for the daily decision being made for you (Motion $34/mo, Sunsama $20/mo, Reclaim $10+/mo).*

**Product principle:** code does the arithmetic, AI does the judgment. Capacity math, conflict detection, and slot placement are deterministic; the model only selects, orders, defers, and explains. (Lesson from the 2026-07-03 precision pass: temp 0–0.2, schema validation, deterministic context.)

---

## Slice 1 — "Plan my day" (core, ship first) — ✅ BUILT 2026-07-06

*All parts below implemented and verified: eval 6/6 on Groq (`scripts/eval-plan-day.mjs`; gpt-4.1-mini leg pending OpenAI credit), E2E via agent-browser on the demo user (plan → review panel → apply → 5 conflict-free blocks + 9 dated deferrals in DB), free-gate 402 on 4th distinct day + 200 on same-day replan. One deviation from the sketch: the future-`start_date` exclusion is enforced in `planDay` itself (post-model filter), not just the candidate query.*

One tap on Today: AI proposes a realistic plan (which tasks, when, for how long, what gets deferred and why); user reviews and applies; applied plan = `is_daily_focus` + `scheduled_time`/`duration` blocks synced to Google Calendar.

### Server

**1a. Refactor `services/scheduling.js` (prep, no behavior change)**
Export the internals `findFreeSlot` already uses: `workingHoursFor(dateStr)`, `collectBusyRanges(ownTasks, googleEvents)`, and add `freeRangesFor(userId, dateStr)` → ordered `[{start, end}]` minutes-of-day gaps inside working hours. `findFreeSlot` becomes a thin consumer.

**2b. New `daily_plans` table (migration)**
```
daily_plans (id, user_id FK cascade, plan_date date, payload jsonb,
             applied_at timestamptz, created_at, UNIQUE(user_id, plan_date))
```
Powers: free-tier monthly gate (count distinct plan_date this month), evening-shutdown diff, re-plan idempotency (upsert same date), later analytics.

**1c. New AI op `plan-day` in `services/ai.js`**
- Context assembly (all existing queries): next actions (`TaskModel.getAll('next_actions', uid, req.today)`), overdue + due-today from other lists, today's scheduled tasks (`getByDateRange`), Google events (`getCalendarEvents(uid, today, today)`), today's habits (reuse habits route query), free ranges (`freeRangesFor`). Cap candidates at ~40 tasks (priority + due date order) to bound the prompt.
- Deterministic pre-compute passed INTO the prompt: total free minutes, meeting count/load, per-task annotated line (reuse the `getDailyPriorities` renderer: overdue-by-N, energy, estimate, project).
- ROUTING: `'plan-day': { primary: groq llama-3.3-70b, fallback: openai gpt-4.1-mini }`; TASK_PARAMS `{ temperature: 0.2, max_tokens: 2000 }`.
- Output schema + validator (same pattern as `validateDailyPriorities`):
```
{ plan:      [{ task_index, start:"HH:MM", duration_mins, reason }],
  deferred:  [{ task_index, move_to:"YYYY-MM-DD", reason }],
  summary:   string,          // one calm sentence for the hero
  overloaded: boolean }
```
- **Code re-validates every block**: indexes in range, inside working hours, no overlap with busy ranges or each other, total fits free capacity. On violation → deterministic nudge to next free slot (reuse slot-scan), not a model retry. If candidates exceed capacity the validator REQUIRES a non-empty `deferred` — the "protects your day" behavior is enforced, not hoped for.

**1d. Routes**
- `POST /ai/plan-day` — `enforceAiLimit` + plan gate (below). Returns `{ plan, deferred, summary, overloaded, tasks }` (tasks attached for index→id mapping, same as daily-priorities) and upserts `daily_plans` (payload, applied_at null).
- `POST /ai/apply-plan` — body `{ items:[{taskId, start, duration}], deferred:[{taskId, moveTo}] }`. Per item: `TaskModel.update` → `due_date=today, scheduled_time, duration, is_daily_focus=true`; deferred → `due_date=moveTo, scheduled_time=null`. Call `syncTaskToCalendar` per updated task (same as `routes/tasks.js` does — sync lives in the route layer). Stamp `daily_plans.applied_at`. No AI call → no `enforceAiLimit`.

**1e. Gating (the monetization hook)**
`billing.js`: add `FREE_LIMITS.plan_days_per_month = 3` + `assertPlanWithinLimit(userId)` counting `daily_plans` rows this calendar month (`plan_date >= date_trunc('month')`); Pro = unlimited (`isProActive` short-circuit, same as `assertWithinLimit`). 402 `LimitError` → client UpgradeModal (already exists). Free users see the button always — with "2 of 3 free plans left this month" so the ceiling is visible before it's hit.

### Client

- **Dashboard hero**: "Plan my day ✨" primary button beside the existing AI-suggest (which stays as the lightweight no-schedule alternative). Hidden when `aiOff`; disabled with an upgrade prompt at the free ceiling.
- **PlanReviewPanel** (new component, reuse `InboxProcessPanel` select/apply patterns): time-ordered proposed blocks with reasons, deferred section ("moving to Thursday: …"), per-item deselect, then Apply. Assisted AND auto modes both review in v1 — moving a user's day is high-stakes; autopilot earns one-tap-preselected, not silent apply.
- After apply: Today renders the plan time-ordered (blocks already show on Calendar via existing scheduled-task rendering). `task-captured` event refreshes.
- `api.js`: `ai.planDay()`, `ai.applyPlan(items, deferred)`.

### Eval (gate before flipping Groq primary live)
`scripts/eval-plan-day.mjs` — reuse the argv `provider:model` harness. ~10 fixture days: packed-meetings day, empty calendar, overdue pile, overload (10h of tasks / 3h free — MUST defer), weekend, low-energy afternoon, tasks without estimates. Assert: schema valid, zero busy-overlap, fits capacity, defers on overload, reasons non-empty. Run vs `groq:llama-3.3-70b-versatile` and `openai:gpt-4.1-mini`.

**Estimate: 3–4 sessions.** 1a+1b+1c one session, 1d+1e one, client one, eval+polish one.

---

## Slice 2 — Morning brief (the ritual) — ✅ BUILT 2026-07-06

*Implemented as planned: `GET /ai/day-brief` (no AI call, no aiLimit) + `DayBrief` banner (CTA state → progress state after apply, per-day localStorage dismiss). Two additions the build surfaced: (1) `clampRangesToNow` — free windows now start at the user's current local time, which also fixed plan-day proposing blocks in the past when planning mid-afternoon; (2) validator floor for `duration_mins` relaxed 15→5 after a live repair-loop deadlock: seeded tasks carry 10-minute estimates, the prompt says use them, and a validator floor above real estimates makes repair unwinnable.*

The daily hook, and it's mostly free: the deterministic half (free minutes, meeting load, candidate count) needs **no AI call**.

- Banner in the `AutopilotNudge` slot (`Dashboard.jsx:212`), shown on first open of the user's day (compare server `last seen plan_date` / localStorage): *"3h10m free between 4 meetings today · 6 candidates → Plan my day?"*
- One button → Slice 1 flow. Dismiss = gone for the day.
- If a plan already exists for today: brief becomes progress ("2 of 4 done, on track").
- No push/cron in v1 — on-open only. (A future scheduled brief must read `users.timezone` — `req.today` comes from the request header, which background jobs don't have.)

**Estimate: 1 session.**

---

## Slice 3 — Evening shutdown + overload protection — ✅ BUILT 2026-07-06

*Implemented: day-brief now returns `unfinished[]` + `daysPlanned` (applied plans only); `POST /ai/shutdown-defer` with three modes (tomorrow / slot via findFreeSlot — deterministic, no AI / release); `DayShutdown` card shows when a plan is applied, blocks remain, and it's ≥17:00 user-local OR >60% done — it takes the banner slot over from DayBrief (shared `shutdownDue` predicate so they never stack), and when the last block is resolved the brief returns in its "plan is done — close the laptop" state. E2E-verified: slot action moved the block to tomorrow 09:00, GCal-synced. Overload honesty had already landed in slice 1 (PlanReviewPanel deferred section). Whole feature now = brief → plan → review → apply → progress → shutdown.*

The calm signature, closes the loop.

- **Shutdown card** (Dashboard, after ~17:00 user-local or when >60% of plan done): unfinished plan items with one-tap outcomes — "move to tomorrow" (due_date+1, clear time), "find a slot tomorrow" (`findFreeSlot(tomorrow)`), "let it go" (back to next_actions, no date). Ends with the existing "All clear — go close the laptop" payoff.
- **Overload honesty**: `overloaded:true` renders the deferred section prominently ("Today didn't have room for these — that's the plan working, not failing").
- **"Days planned" counter** on `daily_plans` (applied ones) — retention metric now, feeds the Pro analytics dashboard (P1 #8) later.

**Estimate: 1–2 sessions.**

---

## Cross-cutting

- **AI modes**: `off` → feature invisible (no AI calls, per userPrefs enforcement). `assisted`/`auto` → same review flow v1.
- **Cost**: plan-day ≈ 4–6k tokens; 1 call/user/day. 100 DAU ≈ +15M tokens/mo ≈ +$5–7 on the mini path — noise. Counts against `ai_usage` like every op.
- **GCal edge cases**: no write scope → plan applies locally, sync soft-fails (existing behavior); events without times (`all_day`) already skipped by `collectBusyRanges`.
- **Sparse durations**: default 30min (capture) / 60min (existing calendar default); reasons can say "guessed 30m". Learning durations = later.
- **Habits**: shown in the brief as context; NOT auto-scheduled (the unvalidated bet from FEATURE_RESEARCH_2026 #7 stays unbuilt).
- **Launch tie-ins**: hero video = the 15-second plan-my-day moment; founder pre-sale page headline test ("your day, planned calmly") doubles as demand validation per the 2026-06-08 research.

## Risks

| Risk | Mitigation |
|---|---|
| Model packs a bad day | Code owns math/conflicts; validator enforces fit + defers; review-before-apply |
| Users don't trust day-level moves | Assisted-style review for everyone in v1; reasons on every block |
| Head-to-head with funded players | Wedge = calm framing + price; validate via pre-sale page before heavy marketing |
| Duration data missing early | Defaults + visible "guessed"; don't block on it |
| Free-tier abuse | 3 plans/month gate + ai_usage cap, both server-side |

## Sequencing vs launch P0s

This is a **P1-sized bet (5–7 sessions)** and does not displace the launch gates (Paddle live, Google verification, legal review). Recommended: ship Slice 1 behind the Pro gate *before* public launch if the P0s are waiting on external reviews anyway — it's the strongest thing to put on the pricing page and in the launch video.
