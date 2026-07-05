# Review 2026-07-03 — AI prompts + user-perspective UX audit

A full audit of (1) the app's logic from a non-GTD user's perspective and (2) every AI prompt in the app, followed by implementation of all corrective actions. Shipped commits: `efa4f39` (server AI overhaul), `1ed638e` (client UX pass). Landing-page work the same session: `fe66b33` (screenshot carousel), `057f25a` (consent banner + GA loader, inactive), `adcbfd3` (canonical tags), `cf39305` (SEO on-page pass).

---

## Part 1 — App logic from the user's perspective

**Core finding:** Cleartable is a calm-productivity *surface* laid over an uncompromised GTD *engine*. The engine is correct and elegant; the seams between the two vocabularies are what "feels off." A non-GTD user meets untranslated jargon; the fix is to finish the translation layer, **not** to rename the GTD lists (they're the credibility and they're semantically precise).

Findings, ranked by how much they confused:

1. **"Today" vs "Next Actions" overlap** — two nav items, overlapping content, no explanation. Today = `is_daily_focus` (+ due-today); Next Actions = all actionable. The focus concept had **four names** (today's focus / Daily Focus / focus list / Add to today's focus). → **Fixed:** unified to "Today" everywhere.
2. **Priority invisible but active** — default sort on every list was "Priority", but the modal had no priority field; only AI set it. → **Fixed:** p1–p5 chip row in TaskModal (5 = most important).
3. **Inbox "Process with AI" card navigated away** — the card promised one-pass processing but routed to `/ai` where you clicked again; a separate sparkles button did it inline. → **Fixed:** card now processes inline; kept a secondary "open AI Assistant" link.
4. **No onboarding** — new users land on Today with GTD-jargon empty states. → **Fixed (partial):** dismissible 3-step first-run tour (capture → clarify → Today). Seeding default contexts on first run is still open (see PROJECT_KNOWLEDGE AI Quality Workstream #5 / Build Backlog #8).
5. **Vocabulary drift** — "ritual" means 4 things; completion was "shipped"/"completed"/"done"; "Someday/Maybe" vs "Someday / Maybe"; lowercase "next actions" badges. → **Fixed:** `listLabel()` helper, "done" everywhere, "Someday/Maybe" standardized. "ritual" overload left alone (low harm).
6. **Time fields ambiguous** — "Time (min)" (estimate) vs "Duration (min)" (block length). → **Fixed:** "Estimate (min)" / "Block length (min)".
7. **Projects page omitted GTD's core check** — "every project needs a next action" only surfaced in Weekly Review. → **Fixed:** amber "needs next action" chip on the Projects page.
8. **Overdue tasks had no cue** — TaskCard didn't render due dates at all. → **Fixed:** rose "overdue ·" date across Dashboard/Lists/Projects/TaskCard.

**Deferred (deliberate):** Smart Capture routing preference still lives in localStorage (not synced cross-device); the "ritual" wording overload.

> **Update 2026-07-04:** the routing-preference item above shipped as a broader fix — see `PROJECT_KNOWLEDGE.md` feature #61 (AI Mode dial). It's now a server-side `off`/`assisted`/`auto` setting on the user, also addressing the separate long-standing gap that there was no way to fully disable AI for GTD purists. "ritual" wording overload is still open.

---

## Part 2 — AI prompt audit + overhaul

The prompt architecture was already good (JSON mode, Groq→OpenAI fallback, confidence fields, honest-uncertainty rules, few-shot from corrections in Smart Capture, graceful raw-capture degradation). The gaps were systemic and precision-critical.

### Cross-cutting fixes (in `services/ai.js` + new `services/aiSchema.js`)
- **Temperature was never set** → provider default (Groq 1.0). Identical captures classified differently between runs. Now: `TASK_PARAMS` sets **temp 0** for classification/extraction, 0.2–0.4 for advisory prose, plus per-task `max_tokens` with a `finish_reason==='length'` truncation check.
- **No output validation beyond JSON.parse.** New `aiSchema.js` validates every response (enums, priority range, date/time formats, index bounds, exactly-one-keep in dup groups) and **coerces common LLM slop** (`"null"`→null, `"4"`→4) in place. On failure, `complete()` does **one repair round-trip** (model sees its own output + the problem list) before falling to the next provider.
- **Priority scale direction was undefined** (`priority: 1-5` with no direction) — matched the app's 5-first sort only by luck. Now stated in the shared system prompt and every schema: **5 = most important**.
- **Reasoning fields were GTD jargon** ("the next physical action"). System prompt now instructs plain language for any user-facing `reasoning`/`reason`.
- **Error contract unified:** 503 (no provider configured) / 502 (all providers failed). Previously some AI failures returned `{error}` as a **200 success body**.
- **Metering gaps closed:** `analyze-task` and `project-breakdown` now go through `enforceAiLimit` like the other explicit AI actions.

### Per-feature context injection
- **Daily Priorities** (worst offender) picked "today's focus" with **no due dates, no today, no calendar load**. Now injects due date, overdue-by-days, start date, priority, today's date, and minutes already time-blocked today.
- **Process Inbox** now gets active projects (+ `project_name` resolved to ids server-side, and `time_estimate_minutes`→`time_estimate` normalized for the apply route), today's date, few-shot correction history, and emits due_date/energy/time/waiting-for.
- **Smart Capture** flags `possible_duplicate_of` against the user's open task titles.
- **Project Breakdown** now sees the project's existing tasks (stops proposing duplicates) and the execution mode (sequential vs parallel → ordering).
- **Analyze Task** now gets projects + today's date + few-shot history (was title/notes only).
- **Weekly Review** labels truncated lists ("showing 30 of N"), sees a someday sample, and emits `someday_candidates` — a real "Get Creative" step.
- **Shared helpers** `formatContextOptions` / `formatHistoryBlock` so every classifier sees the user's world identically.

### Eval
`server/scripts/eval-smart-capture.mjs` extended with priority-direction and duplicate-detection cases and pinned to temp 0 (matches production). **Run it before any prompt/model change.** New prompts scored **47/49 (96%)** on llama-3.3-70b; both misses were Groq daily-token 429s, not model errors. Validators additionally smoke-tested offline (clean accepted, slop coerced, planted problems caught, bounds enforced).

### Client follow-ups
AI failures now surface as error toasts in AIAssistant + Projects breakdown (were silent `console.error`). **Not yet built:** the client doesn't display `possible_duplicate_of` (capture toast) or `someday_candidates` (Weekly Review) — the server emits both; UI render is a small follow-up.

---

## ⚠️ Operational risk (must fix before launch)
**OpenAI API quota is exhausted** (billing 429 since ~2026-06-30), so the gpt-4o(-mini) **fallback is dead** — if Groq fails, AI features 502. Groq free tier is **12k tokens/min + 100k tokens/day**; a single eval run consumes most of a day's budget. Before real traffic: restore OpenAI billing or upgrade Groq Dev Tier. Don't run evals and demos on the same day.
