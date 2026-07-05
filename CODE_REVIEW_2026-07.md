# Cleartable — Full Code + Business Review (2026-07-02)

Produced by four parallel deep-review agents (server, AI/billing/auth, React client, landing/funnel) plus a business synthesis against `FEATURE_RESEARCH_2026.md` and the launch strategy in `PROJECT_KNOWLEDGE.md`. This is a working checklist — check items off as they're fixed.

**Overall:** substance is real (consistent user-scoping, good AI degradation chain, correct Paddle signature handling, above-average legal pages). But there is one true critical vulnerability, a cluster of launch blockers, and a strategic funnel hole: the site asks people to trust a product they can't see and want a deal they can't buy.

Severity: **CRITICAL** (fix now) · **HIGH** (launch blocker) · **MEDIUM** · **LOW**.

---

## 1. Fix immediately (this week)

- [x] **CRITICAL — SQL injection in `ProjectModel.update`** (`server/src/db/models.js:458-471`). ✅ Fixed `2def770` (column whitelist). Builds `SET ${field}` from raw `Object.keys(req.body)` (via `routes/projects.js:48`); unlike the other update paths it has no whitelist. Any authenticated user can craft a body key to exfiltrate the whole DB (emails, Google refresh tokens, Paddle IDs) or plant rows in another user's account (`user_id` injection). **Fix:** whitelist `['name','description','status','outcome','execution_mode']`.
- [x] **CRITICAL — Cross-user FK binding** (`models.js:125-157,160,672-683`; `routes/projects.js:87`). ✅ Fixed `5316d80` (ownership guards on write + `p.user_id` match on all JOINs; verified with 2-user integration test). `project_id`/`list_id` accepted with no ownership check; SERIAL ids are enumerable → leaks other users' project names via the `LEFT JOIN projects` (no `p.user_id` filter), and attacker list-items get cascade-deleted with the victim's list. **Fix:** verify FK ownership on create/update.
- [x] **P0 — Silent login failure** (`client/src/pages/Login.jsx:56`; `AuthContext.jsx:32`). ✅ Fixed `cd58d99` (visible error + signing-in state). `login()` throws on non-OK response, nothing catches it. Non-allowlisted beta users complete the Google popup → nothing happens, no message. First screen of the beta. **Fix:** catch + show error state ("this app is in private beta").
- [x] **P0 — 401 redirect goes to wrong path in prod** (`client/src/lib/api.js:26`). ✅ Fixed `cd58d99` (uses `BASE_URL`). Redirects to `/login`, but prod serves the app at `base: '/app/'`. Expired token ejects the user to the landing domain. **Fix:** `/app/login` (use `import.meta.env.BASE_URL`).
- [x] **P0 — Capacity-gate 402s handled nowhere** (`Projects.jsx:89-177` naked awaits; `Habits.jsx:200`; NewListModal; `api.js:41-46` sets `err.code` but no caller reads it except `BillingSection`). Gates are LIVE in prod → Free user at limit clicks Create → unhandled rejection, dead button. Revenue loss at the exact upgrade moment. ✅ Fixed `05e53cb` (shared UpgradeModal + central api.js interceptor + gated handlers catch cleanly).
- [~] **HIGH — Legal placeholders live in prod.** ODR→ČOI + Cloudflare sub-processor ✅ Fixed `73e8174`. `support@cleartable.app` deliverability still to confirm. ⛔ **STILL OPEN — needs Jan's input:** `[registered address — fill in]` in privacy.html §1 + terms.html §1. Blocks Paddle approval + GDPR.
- [x] **HIGH — False competitive claim** on landing + stale copy. ✅ Fixed `73e8174` (weekly-review claim softened; PWA "installable today"; schema OS "Web (PWA)"; "prepare your weekly review").

---

## 2. Pre-launch blockers (before public launch / live payments)

### Compliance & security
- [x] **HIGH — No account deletion (GDPR Art. 17).** ✅ Fixed `c145c5b` — migration `1782400000000` adds `ON DELETE CASCADE` to all 8 user FKs; `DELETE /api/auth/account` cancels Paddle sub + revokes Google token (best-effort) then cascade-deletes; Settings danger zone + confirm modal. Verified end-to-end.
- [ ] **HIGH — Plaintext Google Calendar refresh tokens** with write scope (`initial-schema.js:20-21`; written at `routes/auth.js:140-148`, `services/googleCalendar.js:28-33`). DB leak = attacker writes to users' calendars. Also a Google sensitive-scope review question. **Fix:** envelope-encrypt (AES-GCM, key from env) before insert.
- [~] **HIGH — No rate limiting on AI endpoints + metering OFF + `aiLimit` fails open** (`middleware/aiLimit.js:25-28`; `services/aiUsage.js:9-12`). ✅ Per-user 30/min limiter on `/api/ai/*` + `/custom-lists/extract-url` added `66d411a` (verified). ⛔ **STILL OPEN (decision needed):** turn on `AI_DAILY_LIMIT_FREE` env on Railway (deliberately off for calibration — Jan's call); optionally flip `aiLimit` to fail-closed for cost endpoints.
- [ ] **MEDIUM — 7-day JWT in localStorage, no revocation, client-only logout** (`routes/auth.js:74-78`; `AuthContext.jsx:38-41`). XSS → token valid up to 7 days with no server kill switch. **Fix:** token-version column checked in `requireAuth` (min), ideally httpOnly cookie + shorter expiry.
- [ ] **LOW — No `JWT_SECRET` boot assertion** (`middleware/auth.js:3`). Add a startup check (present + length ≥32) next to `pingDb()`.

### Billing correctness (before live Paddle keys)
- [ ] **HIGH — Unhandled webhook events**: `subscription.paused/resumed/past_due/trialing` (`services/paddle.js:91-101`). Paused→resumed user gets locked out of Pro while still billed. **Fix:** add the four EventNames to the switch (all → `syncSubscription`).
- [ ] **HIGH — Founder "first 30" cap unenforced** (`routes/billing.js:38-40` TODO). Price used per sub isn't even recorded, so founders can't be counted. **Fix:** count + gate, record plan/price on sub.
- [ ] **MEDIUM-HIGH — Refunds/chargebacks never revoke Pro.** No `adjustment.*`/`transaction.*` handling; with the period-end grace rule (`services/billing.js:17-19`) a yearly refund keeps Pro ~12 months. **Fix:** on adjustment/chargeback set `current_period_end = now()`.
- [ ] **MEDIUM — No webhook ordering/idempotency guard** (`paddle.js:52-86`). Stale retried `updated(active)` after `canceled` resurrects a terminal sub permanently. **Fix:** store `occurred_at`, skip older events; dedup on `event_id`.
- [ ] **MEDIUM — No double-subscription guard** (`routes/billing.js:27-54`). Pro-monthly user clicking "Founder" creates a 2nd live sub; `paddle_subscription_id` overwritten by last webhook → orphaned sub keeps billing invisibly. **Fix:** 409 if active sub exists.
- [ ] **LOW — Webhook `user_id` from custom_data unvalidated** (`paddle.js:61-70`); malformed value → 400 → Paddle retry loop. `parseInt` + 200-ack unmappable events.

### Correctness that burns real users
- [x] **HIGH — UTC-anchored "today"** breaks habits, streaks, daily focus, deferred tasks, recurrence for any non-UTC user (incl. the founder in Prague). ✅ Fixed `2b08c4d` — `users.timezone` column (captured at login), `req.today` resolved per request from `X-Client-Timezone`, threaded into `TaskModel.getAll/getDailyFocus/getDeferred/getStats/complete` + habits/ai routes. Verified (Kiritimati +14 boundary test + 27 habit tests).
- [ ] **HIGH — Export/import round-trip corrupts data** (`routes/export.js:12-22,34-43`; `import.js:277,290-297`). `HABIT_FIELDS` omits `type`; `HABIT_LOG_FIELDS` omits `status`+`note` → quit-habit **slips re-import as completions**, rest days → done, notes lost, quit→build. Custom lists, list items, weekly reviews not exported at all. `TASK_FIELDS` omits `position` → sequential projects scramble. CSV also drops `start_date`, `duration`, `is_daily_focus`, `recurrence_type`.
- [ ] **MEDIUM — Import is non-transactional, non-validated, append-only** (`import.js:218-349`). Mid-import failure after N rows → user retries → duplicates. No enum validation on `list`/`energy_level`. **Fix:** wrap in one transaction; validate enums; consider import-batch tag for undo.
- [ ] **MEDIUM — OpenAI fallback client untuned** (`services/ai.js:9-11`): default 10-min timeout × up to 3 retries. Degraded OpenAI pins request + Express worker for minutes (weekly-review worst). **Fix:** `new OpenAI({ timeout: 30000, maxRetries: 1 })`.
- [ ] **MEDIUM — Monthly/yearly recurrence drifts at month-end** (`models.js:295-297`). Jan 31 monthly → Mar 3 forever; Feb 29 yearly. **Fix:** clamp to last day of target month.
- [ ] **MEDIUM — Recurring completion not transactional/idempotent** (`models.js:232-259`). Crash between snapshot INSERT and UPDATE, or double-tap, → polluted completed history. **Fix:** wrap in transaction.
- [ ] **MEDIUM — Weekly-review streak never expires** (`models.js:521-537`). Only measures gaps between past reviews; Jan streak of 5 still shows in July. **Fix:** compare newest review to now (≤10 days).
- [ ] **MEDIUM — AI output not enum-validated before DB write** (`routes/ai.js:128`; `models.js:160-162` whitelists fields not values). Off-enum `list` from Llama → task lands in a list no view queries → disappears. **Fix:** validate `list`/`energy_level`/`priority` before insert.
- [ ] **MEDIUM — find-duplicates/import prompts unbounded** (`routes/ai.js:330-344`; `ai.js:511-513,417-419`). Power user → prompt exceeds Groq TPM → gpt-4o → context overflow or silent cost. **Fix:** cap ~300 tasks / limit import text length (weekly-review already slices 30/20).
- [ ] **MEDIUM — Consume-before-call charges failed AI ops** (`middleware/aiLimit.js:14`; `routes/ai.js:60`). When enforcement is on, a both-providers-fail request still burns a unit. **Fix:** decrement on total failure, or consume after success.

---

## 3. Robustness / scale (harden before growth)

- [ ] **MEDIUM-HIGH — No pagination anywhere; completed tasks unbounded** (`models.js:39-44`), amplified by recurring-completion snapshot rows (365/yr per daily task). Completed view serializes thousands of rows every visit.
- [ ] **MEDIUM — `ProjectModel.getAll` 2N+1** (`models.js:399-430`) through a `max:5` pool (`pool.js:18`); 50 projects = 101 queries/sidebar-load. Same in `CustomListModel.getAll`. **Fix:** `COUNT(*) FILTER` / `DISTINCT ON` in one query.
- [ ] **MEDIUM — Google Calendar fetch truncates at 250 events** (`googleCalendar.js:160-166`), no `pageToken` loop, `singleEvents:true`. Events silently vanish. **Fix:** paginate.
- [ ] **MEDIUM — Malformed `target_days` bricks the habits API forever** (`habits.js:33,275,407` bare `JSON.parse`; `import.js:277` inserts unvalidated). `GET /habits` + `/stats` 500 permanently for that user with no UI fix. **Fix:** try/catch parse + validate on import.
- [ ] **MEDIUM — Full multi-endpoint refetch after every mutation** (`Dashboard.jsx:77-119`, Inbox, Calendar). Check-off refetches stats+focus+habits+projects; ~300-800ms per tap + server load. **Fix:** optimistic local removal + targeted refresh.
- [ ] **MEDIUM — No virtualization + per-card `backdrop-filter: blur` on `.glass`** (`index.css:81`). 100+ cards chug on mid-range Android (PWA target). No `React.memo` on `TaskCard`. **Fix:** memoize + virtualize long lists; consider cheaper card surface.
- [ ] **MEDIUM — TimeGrid resize = PUT + full refetch per mousemove** (`TimeGrid.jsx:167-187` → `Calendar.jsx:187-192`). Request storm + racy jitter on the flagship calendar interaction. **Fix:** track duration locally, commit on mouseup.
- [ ] **LOW — No rate limiting on authenticated write routes** (`index.js:65-73`); one buggy client can exhaust the 5-conn pool. Waitlist limiter uses **leftmost** XFF (client-controlled → bypassable) + unbounded in-memory Map (`waitlist.js:19-36`); use `req.ip`.
- [ ] **LOW — In-memory per-process state** breaks multi-instance: `ipBuckets`, `migratedCalendarCache`; `ensureGtdCalendar` race creates two "Cleartable" calendars.
- [ ] **LOW — Missing composite index `tasks(user_id, list)`**; position auto-assign races (`SELECT MAX+INSERT`).
- [ ] **LOW — No route-level code splitting** (`App.jsx:3-15`); AIAssistant (1000 lines) + WeeklyReview + calendar in first paint. `React.lazy` per route.

---

## 4. Data integrity & destructive actions
- [ ] **MEDIUM — Hard deletes everywhere, cascades destroy history, no undo/trash** (`tasks.js:113`, `projects.js:59`, `habits.js:284-296` cascade-drops entire log history, `customLists.js:54`). One tap erases a 2-year streak. Project delete orphans tasks silently (`SET NULL`).
- [ ] **LOW — `DELETE /habits/rest-days` clears ALL skipped logs in range** (`habits.js:147-163`), incl. deliberately-set single rest days; uses DELETE body (some proxies strip).
- [ ] **LOW — `counts.habit_logs` overcounts** on import (`import.js:287-297`) even when `ON CONFLICT DO NOTHING` skipped.
- [ ] **LOW — CSV formula injection** (`export.js:74-79`): title `=HYPERLINK(...)` executes in Excel. Neutralize leading `= + - @`.
- [ ] **LOW — Restore from Completed hard-codes `inbox`** (`CompletedTasks.jsx:74-80`); restored Waiting-For item lands off-list. Restore to original list.

---

## 5. Client UX / correctness
- [ ] **P0 — Fetch failures render as fake happy empty states.** Every page's `fetchData` catch-and-`console.error` only (`Inbox.jsx:70`, `Lists.jsx:102`, `Dashboard.jsx:89`, `Projects.jsx:41`, `Calendar.jsx:66`, `CompletedTasks.jsx:66`, `Layout.jsx:100`). Flaky mobile → "Inbox zero. A clear mind." = looks like data loss. **Fix:** error + retry state everywhere.
- [ ] **P0 — Hover-gated actions unusable on touch** (`Inbox.jsx:272`, `Lists.jsx:254`, `HabitCard.jsx:115`, `CompletedTasks.jsx:30`, `CustomList.jsx:287`). No hover on phone; TaskModal has **no delete button** as fallback → can't delete tasks/habits on the PWA. **Fix:** always-visible actions on touch + delete in modal.
- [ ] **P0 — No undo for complete/delete anywhere** (`Toast.jsx` has no action slot). ADHD/mis-tap audience. **Fix:** undo-on-complete toast.
- [ ] **P1 — AI apply actions: `try/finally` no catch, no success/error feedback** (`AIAssistant.jsx:82-217`; `Projects.jsx:135-144`; `processInbox` catch = console only). Spinner stops, panel vanishes, no toast either way.
- [ ] **P1 — Optimistic complete rollback silent/broken** (`Dashboard.jsx:103-119` silent un-check; `Projects.jsx:517,560-565` `optimisticDone` Set never cleared → task struck-through forever on server error).
- [ ] **P1 — Priority sortable but not user-editable** (`SortDropdown.jsx:28` defaults to priority; `TaskModal.jsx` has no priority field — only AI sets it).
- [ ] **P2 — Divergent duplicated logic:** 5 `handleComplete` variants (different toasts/optimism per page), hover-delete block copy-pasted 6×, two different Process-Inbox implementations, `CONFIDENCE_COLOR` duplicated. Loading flashes full-page spinner on Lists refetch but not Inbox.
- [x] **P2 — Per-device settings in localStorage** (`smart_capture_routing`) diverge between phone/desktop. ✅ Fixed 2026-07-04 — `smart_capture_routing` moved server-side as `users.ai_mode` (off/assisted/auto); legacy localStorage value auto-migrates once via `AuthContext` then deletes itself. Remaining localStorage keys (sort/filter view prefs, tour-dismissed) are lower-stakes per-device UI state, left as-is; unbounded key sprawl and the transient cross-list filter write (`Lists.jsx:75-85`) are still open.
- [ ] **P2 — Minor leaks:** `UpdatePrompt.jsx:16-23` interval/listeners not cleaned; `Toast.jsx:12` timeout; nested `<button>` in Dashboard HabitsCard (`:491-507`).

- [x] **P2 — Context labels render `@@` for all real users** (found 2026-07-02). ✅ Fixed — added `lib/context.js` `contextLabel()` (strips leading `@`(s), adds exactly one) and applied it at every render site (Dashboard, Projects, CompletedTasks, TaskCard, Lists header, InboxProcessPanel, AIAssistant, TaskModal select). Robust to both `@`-prefixed storage (the enforced convention) and bare AI-written values, so `@@home` can't recur. Verified visually with `@`-prefixed demo data. No migration needed (storage convention unchanged).

## 6. Accessibility
- [ ] **P1 — No modal focus management** (TaskModal, HabitModal, ConfirmModal, CommandCapture, HabitCalendar): no `role="dialog"`, `aria-modal`, focus trap, or focus-restore. Tab reaches background; destructive Delete sits in that layer.
- [ ] **P1 — `--text-3` (#6b6b75 on #0a0a0f ≈ 3.7:1) fails WCAG AA** and is used for 9.5-11px mono labels everywhere incl. placeholders (`index.css:147`).
- [ ] **P1 — No `prefers-reduced-motion`** anywhere (32s aurora loop, page staggers, toast slides). Off-brand for ADHD positioning.
- [ ] **P2 — Icon-only buttons without accessible names** (modal X, HabitCard pencil/trash, hover trash — `title=` only, unreliably announced). `linkify` `<span role="link">` has no `tabIndex`/keydown → keyboard-unreachable. Toasts not `aria-live` → all error reporting invisible to AT.

---

## 7. Product gaps (table stakes users hit week one)
Ranked by user pain:
1. [ ] **Global search — none** (client + API). ⌘K is capture-only. Needs a server search endpoint (can't download everything).
2. [ ] **Notifications/reminders — none.** Due dates + scheduled times exist; app never alerts. Web push via the PWA.
3. [ ] **Quick date actions** — no "postpone to tomorrow" chip; rescheduling = full modal each time. Pair with a calm "shift overdue → today" bulk action (vs the current "hide overdue" avoidance toggle).
4. [ ] **Bulk operations / multi-select** — none outside AI flows (client + API).
5. [ ] **Subtasks / checklists** — none; projects are the only (heavyweight) decomposition.
6. [ ] **Offline capture queue** — API is NetworkOnly; offline capture loses text (`QuickCapture.jsx:67`).
7. [ ] **Drag-reorder in Next Actions** — only sequential-project + custom-list chevrons.
8. [ ] **Archive state for projects** — completed projects grow in `getAll` forever (no filter param).
9. [ ] **Account recovery** — Google-OAuth-only; lost Google access = lost tasks, no export-without-login.

---

## 8. Business / funnel (highest-leverage growth)
Ranked:
1. [ ] **Real product screenshots on the landing page** (preview frame is a "coming soon" placeholder — zero UI shown anywhere). Then record the 60s demo (`DEMO_60S.md` storyboard ready). Biggest single conversion lever.
2. [ ] **Founder pre-sale purchase path** — 3 pricing cards, zero buttons. Paddle sandbox tested. Add "Reserve a founder spot" (waitlist `source:'founder'` until live keys).
3. [~] **Waitlist welcome email + founder-priority copy.** ✅ Built — `services/email.js` (Resend, dependency-free, no-ops without key) sends a welcome email on new signups only; bottom form now has a real success state; success copy ties to founder-price priority. ⛔ **To activate:** verify `cleartable.app` in Resend + set `RESEND_API_KEY`/`WAITLIST_FROM_EMAIL` on Railway (Jan).
4. [ ] **Fix "Sign in" dead-end** — routes non-test-users to Google's "unverified app" block. Route to a private-beta interstitial until OAuth verification.
5. [ ] **GTD-forward entry point for the r/gtd soft launch** — landing hides GTD but that's the first launch channel. Anchor section or "Cleartable for GTD" page (contexts, defer, waiting-for, 4-step review). Reframe AI as "prepares" not "runs" the review.
6. [ ] **Import-from-Todoist story** — FAQ only advertises CSV *export* (an exit door). Switchers ask how to get 400 tasks in.
7. [ ] **vs-Todoist / "best GTD app 2026" comparison content + pages** — targets real commercial queries (current head-term blog posts won't rank on a DR-0 domain).
8. [ ] **Name + face the founder** (currently "The founder"; privacy.html already names Jan Bambas — anonymity is broken and costs HN/Reddit credibility).
9. [ ] **Landing no-JS / reduced-motion fallback** — `.reveal` starts `opacity:0`; if JS fails, features/pricing/problem cards are invisible. Add `<noscript>` + `prefers-reduced-motion` override; calm the 5 always-animating blurred orbs.
10. [ ] **Blog internal linking** — homepage links only `/blog/`; money post ("How AI Can Organize Your To-Do List") has zero inbound internal links. Add related-articles blocks + flagship links.

**Pro-tier strategy note:** the wall-feature (analytics dashboard) doesn't exist yet, so at launch Pro ≈ "unlimited + higher AI cap." Ship analytics before the pre-sale, or make the founder pitch explicitly "lock the price before the features land." Decide downgrade semantics consciously (currently a lapsed Pro keeps all over-quota data).

---

## What's already solid (keep, and market it)
Single-source tier resolution used consistently; correct webhook signature + raw-body handling (5s replay window); genuinely good SSRF guard on URL extraction (per-hop DNS + metadata-range checks); Smart Capture graceful raw-capture degradation; confidence-gated AI routing ("AI that tells you when it's not sure" — under-emphasized on landing); cookieless analytics = no cookie banner (HN-ready trust line); real GDPR-structured legal pages; on-voice blog; server-stamped `custom_data.user_id` + server-side price mapping on checkout.

---

## Suggested sequencing
- **This week (hours):** SQLi whitelist · FK ownership · login error · 401 path · 402→upgrade modal · legal placeholders + ODR + Cloudflare · false OmniFocus claim + stale PWA/schema copy · OpenAI timeout · JWT_SECRET assertion · 2-3 landing screenshots.
- **Before live Paddle keys:** 4 webhook events · refund/chargeback revocation · founder-cap + record price · double-sub guard · webhook ordering · welcome email + founder waitlist copy · reserve-a-spot path.
- **Before public launch (Google verification window):** account deletion e2e · encrypt calendar tokens · AI rate limiting + enforcement ON · tz-aware "today" · export fidelity · error states vs fake empty states · touch-reachable delete/edit + undo · demo video.
- **First post-launch product bets:** global search → reminders/web push → quick postpone + bulk shift-overdue → offline capture queue → subtasks.
