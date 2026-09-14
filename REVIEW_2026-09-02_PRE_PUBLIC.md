# Pre-public review — 2026-09-02

Full-app review at HEAD `9eca6a7` before the Google consent screen is published. Three parallel read-only audits (security, code quality, business-logic consistency) plus a business-case and go-to-market assessment. Nothing in the repo was modified by this review.

**Live state verified today:** `cleartable.app/api/config` returns `paddle.environment: "sandbox"`. Landing page says "now open · free to start" and "Start free with Google". AI caps are set in Railway (`AI_DAILY_LIMIT_FREE=25`, `_PRO=200`). Google consent screen status could not be checked from the repo; per memory it is still in Testing mode. Production DB snapshot was not taken (the sandbox blocked the query), so user counts below come from the 2026-08-10 baseline: 4 test users, 2 waitlist emails, 3 testers created 2–8 tasks and never returned.

---

## 1. Security

**No critical findings. No secrets in the repo or git history.** Parameterized SQL, per-user scoping, Paddle signature verification, Google ID-token verification (audience, `email_verified`, link by `sub`), and AI metering coverage all re-verified clean.

### High
- **H1 — Dead waitlist endpoint is an open mail relay.** `server/src/routes/waitlist.js:20-76`, mounted at `index.js:68`. Unauthenticated `POST /api/waitlist` sends a Resend email to any address; the only guard is an in-memory limiter keyed on the *first* `X-Forwarded-For` hop (spoofable, known M13). Anyone can burn Resend quota and sender reputation from `hello@cleartable.app`. **Fix: unmount the route.** The landing no longer links it.

### Medium
- **M1 — Google Calendar refresh tokens stored in plaintext** (`routes/auth.js:171-179`, `services/googleCalendar.js:28-33`). Full `auth/calendar` scope. A DB leak = persistent read/write to every connected user's calendar. Fix: AES-256-GCM encrypt token columns with an env key.
- **M2 — Sliding JWT has no ceiling and no revocation** (`routes/auth.js:113-145`). A stolen token can be kept alive forever by hitting `/me` weekly; sign-out only clears the victim's localStorage. Fix: absolute-expiry claim (30–90 days) + `users.token_min_iat` bumped on logout.
- **M3 — CSP disabled + JWT in localStorage** (`index.js:35-39`, `client/src/lib/api.js:20`). No XSS sink found today (no `dangerouslySetInnerHTML`, linkify restricted to `https?://`), so this is blast radius, not an exploit. Fix: report-only CSP first, then enforce.
- **M4 — `trust proxy 1` behind Cloudflare → Railway is unverified** (`index.js:30`). If Railway appends the Cloudflare IP, every user shares a few edge IPs and 20 failed logins from anyone lock *everyone* out of sign-in for 15 minutes. Fix: log `req.ip` vs `CF-Connecting-IP` once in prod; adjust hop count or key limiters on `CF-Connecting-IP`.
- **M5 — Unbounded prompt size on AI routes** (`routes/ai.js:69-73`, `:572-576`). Only the 1 MB body limit applies. A 900 KB paste falls through Groq to OpenAI at roughly $0.10 per call; failures are not charged and retryable at 30/min. Fix: reject `text.length > 20 000` with 413 before any provider call.
- **M6 — SSRF guard has a DNS-rebinding gap** (`services/ai.js:937-980`). Hostname resolved for the check, then resolved again by `fetch`. Guard is otherwise solid (redirects re-checked per hop, 8 s abort, 500 KB cap). Fix: pin the resolved IP via a custom lookup.
- **M7 — Import commit non-transactional and unvalidated** (`routes/import.js:219-373`, known M12). One bad row 500s mid-way; retry duplicates. No row cap. Fix: single transaction, validate enums/dates first, cap rows.

### Low
L1 `ListItemModel.update` accepts `linked_task_id` without ownership check (`models.js:729-746`). L2 apply-inbox/apply-import write `list`/`priority`/`energy_level` without re-validation (`ai.js:252-273`, `:608-633`). L3 login never refreshes `email` from Google (`auth.js:54-57`). L4 GDPR export omits custom lists, list items, daily plans, weekly reviews, preferences (`export.js:34-63`). L5 account deletion leaves the `waitlist` row (`auth.js:202-226`). L6 founder cap TODO unenforced + stale Paddle event ordering (`billing.js:38-40`, `paddle.js:60-94`). L7 no boot assertion on `JWT_SECRET` (prod secret is 32 chars, mixed charset, but starts with a readable word — rotate to 64 random bytes before opening; only 4 users get logged out). L8 `sql.js` in prod deps. L9 invalid `X-Client-Timezone` → 500 (`ai.js:84`). L10 URL-extract output has no validator (`ai.js:1018-1046`).

---

## 2. Code quality

**Grades:** Architecture C+ · Correctness risk C · Test coverage D · Ops readiness C- · DX B-.

**Known bugs M9–M13 all still open** (`models.js:269-296`, `export.js:21-22`, `habits.js:491-505`, `import.js:219-374`, `waitlist.js:22`). `ProjectModel.getAll` 2N+1 still open.

Key findings:
- **Habits has no model.** 200 lines of streak math live in `routes/habits.js`; tests import the router. A *second, older* streak algorithm in `routes/ai.js:721-762` feeds the weekly review with different numbers than the Habits page.
- **No request validation.** `req.body` goes straight to models (`tasks.js:89-112`); Postgres CHECK constraints are the API contract, so bad input is a 500 not a 400.
- **No error middleware, no `unhandledRejection`/SIGTERM handlers, no env validation** (`index.js`, `env.js`). Missing `JWT_SECRET` = every request 401 with no boot error. Paddle webhook returns 400 on *any* error including DB outage (`billing.js:119-123`) — Paddle treats that as permanent, not a retry.
- **Transactions rare.** Recurring complete, sequential promote, import, apply-plan, complete-review, account deletion, new-user + default contexts all multi-statement without `BEGIN`.
- **Pool `max:5`, no timeouts** (`pool.js:16-19`). One weekly-review load fires 11 queries; `ProjectModel.getAll` 3 per project on the smart-capture hot path. Two concurrent users on Railway hobby will queue.
- **Missing indexes:** `tasks(user_id, list)`, `tasks(user_id, due_date, scheduled_time)`, `tasks(user_id, updated_at)`.
- **Residual server-local-timezone math** (`models.js:312,358`, `ai.js:545-547,636-640`, `scheduling.js:19`, `googleCalendar.js:141-145,287,315`) — correct only because Railway is UTC.
- **Client:** `hooks/useApi.js` unused; every page hand-rolls fetch + `Promise.all` refetch storms via a `task-captured` window event; three pages are 800–1050 lines; 0 `htmlFor` on 36 inputs; no focus trap in modals; single 537 kB chunk with zero `React.lazy`.
- **Tests:** 27 asserts for one module; no CI, no lint. Pure functions begging for tests: `scheduling.js` pack/free-range math, `aiSchema.js` validators, `_nextDueDate`, `isProActive`, Paddle `syncSubscription`, export→import round-trip.
- **Ops:** 113 raw `console.*`, no Sentry, health endpoint does not touch DB, `email.js:16` logs recipient addresses.

Top 5 refactors before real users: (1) error middleware + asyncHandler + fail-fast env + SIGTERM; (2) zod body validation + collapse 5 duplicated `LimitError` blocks; (3) transactions on multi-write flows + fix 2N+1 + `tasks(user_id, list)` index; (4) vitest + GitHub Actions on the pure modules; (5) TanStack Query + route-level lazy + modal a11y primitives.

---

## 3. Business-logic inconsistencies

Ranked by what a stranger hits today.

1. **Landing says "open now", Google says "access denied".** `landing-page/index.html:175,183,421` vs the consent screen in Testing. Every CTA leads to a Google wall until the Console publish. Operational, not code.
2. **Landing shows $36/yr Pro and $30 Founder cards with no purchase path.** `index.html:364-388` has no buttons on the pricing cards; only the FAQ says "Pro is coming shortly". In-app `BillingSection.jsx:47-48` hides checkout while `/api/config` says sandbox. Server `POST /api/billing/checkout` has **no** production gate — curl still creates a sandbox transaction. Label the cards "opening soon" or wire them, and gate the server route.
3. **"Join waitlist" nav link on all 10 blog pages + 3 legal pages** → `/#waitlist`, which no longer exists. `privacy.html:82` still cites waitlist as the marketing-consent example.
4. **"Full JSON backup / export everything"** (`index.html:448,470`, privacy §9, terms §9) is false: export drops custom lists, list items, daily plans, habit `type`, habit-log `status`/`note` (rest days re-import as completions — known M10).
5. **"Only 30 spots"** (`index.html:380-385`, `BillingSection.jsx:13,143`) — nothing counts founder sales (`billing.js:38-40`). Buyer 31 gets the price.
6. **"Resets tomorrow"** (`aiLimit.js:49`, `lib/aiError.js:14`) — cap bucket is UTC (`aiUsage.js:17-19`). Wrong for anyone west of UTC; Prague resets at 02:00. Plan-day gate correctly uses user tz — inconsistent.
7. **AI cap number is invisible.** Client never calls `GET /api/ai/usage`; "25" appears nowhere until the 429. Smart Capture over-cap toast has no upgrade path (`QuickCapture.jsx:62`).
8. **Weekly review copy implies automatic AI** (`index.html:246`) — it is on-demand and costs a daily action.
9. **`client/index.html:9` meta still says "AI-assisted GTD"** — survived the brand scrub.
10. **Docs:** `PROJECT_KNOWLEDGE.md:544,709` still promise an analytics dashboard in Pro; waitlist described as current at `:120,:267,:471,:573`.

### Legal / compliance gaps
- Privacy §6 sub-processor list **omits Resend** (`services/email.js:19`).
- Privacy §2/§4/§6 describe **Google Analytics as active**; `consent.js` has a placeholder ID and never runs.
- Data categories under-declared: timezone, AI-mode/onboarding prefs, `ai_usage` counters, `daily_plans`, Google refresh-token retention.
- All three legal pages carry an HTML comment `DRAFT — requires human/legal review` while live and in the sitemap.
- Controller identity is IČO only, no address. Founder's decision; residual GDPR Art. 13(1)(a) risk, and Paddle's live onboarding typically asks for a business address anyway.
- Founder "price locked in while you stay subscribed" vs terms §6 "we may change prices" — compatible only if the founder Paddle price is never migrated; nothing guarantees it.

### Tier edge cases with no defined behavior
- Lapsed Pro with 20 projects keeps them, gets a 402 modal on next create, never told why.
- `past_due` users read "Renews <date>" while their card fails; no dunning nudge; silently become Free after period end (`BillingSection.jsx:42,106-109`).
- Free user who archived 3 habits and created 3 new ones can never reactivate the old ones.
- Import silently truncates to quota (`import.js:230,280`) instead of warning.

Verified consistent: 8/1/3 free limits, $4/$36/$30, "Save 25%" arithmetic, no lifetime remnants, no "unlimited AI" claim, `ai_mode=off` enforced server-side, onboarding seed does not consume quota, provider list (Groq + OpenAI; no Gemini in code) accurate.

---

## 4. Business case — honest assessment

**What is real:** the product is broad and genuinely differentiated as a *combination* (AI capture + plan-my-day around a real calendar + habits + lists + weekly review, calm UX, $36/yr). Unit economics hold: modeled AI cost ~$27/mo at 100 DAU against ~$130 gross MRR; hosting ~$15/mo. Paddle handles VAT. Money is not the risk.

**What is not real yet:** demand. Two waitlist emails in two months (one the founder's), four test users, three of whom made 2–8 tasks and never came back. Zero strangers have used the product. The 6-month goal of 50–200 paid users needs roughly 1,000–4,000 sign-ups at a 5% free→paid rate, i.e. 30–130 sign-ups per week starting now, from a site with near-zero real traffic and zero Bing index. That is not a plan, that is a hope. **Reframe the first 90 days as learning, not earning:** the question to answer is "do strangers who sign in come back on day 7", not "how many paid".

**Structural constraints to accept, not fix now:**
- Google-only sign-in shrinks the funnel. Acceptable for launch (most productivity buyers have Google), but say so on the landing so nobody bounces at the login screen surprised. Email/password (P0 #7) can wait for evidence.
- PWA only. Phone capture is the number-one habit for task apps. Verify the iOS add-to-home-screen + capture flow personally before any post.
- Category is the most crowded in consumer software. "Calm" is a feeling, not a search term. The sharpest *acquisition* hook the product already has is **"AI plans your day around your real calendar for $3/month"** — that is Motion's $19/month promise at a sixth of the price, and "Motion alternative" is a real search with buyer intent. Keep "clarity for work & life" as the brand promise; lead comparison content and community posts with plan-my-day.

**Why the current plan is right anyway:** opening the door is the only way to get the retention signal. Directory listings cost hours, not money, and fix the backlink problem. The founder pre-sale is the only demand signal that matters and it is blocked purely on Paddle going live.

**Kill / continue gate at day 90 (2026-12-01):** continue if ≥100 sign-ins from strangers, ≥20% return on day 7, ≥5 paying. If sign-ins are fine but day-7 retention is under 10%, the product has an activation problem — stop marketing and fix onboarding. If sign-ins never arrive, the problem is distribution — narrow the niche (ADHD or GTD) rather than widen it.

---

## 5. Go-public plan

### Step 0 — this week, before publishing the consent screen (Claude ~1–2 days, user ~2 h)
Claude-side, in this order:
1. Unmount `/api/waitlist` (H1). Delete waitlist links from 13 blog/legal pages; fix `privacy.html:82`.
2. Gate `POST /api/billing/checkout` server-side on production + enforce the founder cap (count active founder-price subs, hide/deny at 30).
3. Label the landing pricing cards "Pro opening shortly" until Paddle is live.
4. Legal: add Resend to §6, correct the GA paragraph to "not currently used", add missing data categories, remove the DRAFT comments.
5. Export completeness (L4 + M10) so the "full backup" claim is true; run the round-trip once.
6. Cap AI input length (M5), validate `X-Client-Timezone` (L9), fix "resets tomorrow" copy or bucket the cap by user tz.
7. Env validation at boot + JSON error middleware + SIGTERM/unhandledRejection handlers. Half a day, removes silent misconfig.
8. Sentry (free tier) + welcome email on first sign-in (Resend is live) + a daily "new sign-ins" digest to you. Without these you will not know strangers arrived or where they died.
9. Show the AI counter in Settings and give the over-cap capture toast an upgrade link.

User-side:
- Rotate `JWT_SECRET` to 64 random bytes on Railway (logs out 4 people; do it now, not later).
- One-time check in Railway logs: `req.ip` vs `CF-Connecting-IP` (M4). If they differ, tell Claude.
- Send a test mail to `support@cleartable.app`; confirm it arrives.
- **Start Paddle live verification today** — identity + domain + business. Automatic approval is common; manual review is 5–7 business days. Paddle reads the live site, so do step 4 first. Expect them to ask for an address.
- Install the PWA on your phone, capture 3 tasks, confirm the update banner works.

### Step 1 — open the door (day 3–4)
1. Google Console project 61817722001 → Audience → Publish app. Sign-in is public immediately, no review needed.
2. Submit Calendar-scope verification the same day. Current review times are 2 weeks to 2+ months, and the queue is visibly backed up. Before submitting, consider narrowing from full `auth/calendar` to `calendar.events.readonly` (read the primary) + `calendar.app.created` (the Cleartable calendar it writes to). Narrower scope = faster review and a smaller M1 blast radius. Until approved, only the optional Calendar connect shows the unverified warning.
3. Email the one real waitlist signup. Message the three dormant testers and ask one question: "what made you stop?" Their answers are worth more than any listing.

### Step 2 — quiet week (day 5–12) — find out if anyone comes back
Goal: 20 strangers sign in. Watch sign-in → onboarded → first task → day-2 return in Sentry breadcrumbs and the DB.
- **Directory blitz** (~2 h, Claude drafts every blurb): There's An AI For That, Futurepedia, Toolify, AlternativeTo (as Motion / Todoist / TickTick alternative), Uneed, MicroLaunch, Smol Launch, BetaList, Peerlist, Indie Hackers product page, SaaSHub, Launching Next. Each is a visitor source *and* a backlink, which is the actual fix for zero Bing indexing.
- **One "I built this" post on r/SideProject** (its core function; no bare links, tell the story, ask for feedback). One Indie Hackers post.
- No Reddit productivity subs yet. No Product Hunt.
- Fix whatever the first 20 people hit. Ship daily.

### Step 3 — money on (day 10–21, gated on Paddle approval)
1. Swap the six `PADDLE_*` vars to live + `PADDLE_ENV=production`; redo webhook destination, domain approval, default payment link on the live account; run one real $30 purchase and refund it.
2. Founder pre-sale goes live: "$30/yr, first 30, refundable 30 days". Wire the landing pricing cards to checkout.
3. Publish three comparison pages (long-tail + answer-engine visibility, the app is currently invisible to ChatGPT/Perplexity): "Cleartable vs Motion", "Calm Motion alternatives under $5/mo", "TickTick vs Cleartable for habits + tasks". Submit via IndexNow.

### Step 4 — communities (week 3–6, ≤30 min/day)
- **Reddit**, in this order, after two weeks of helpful answering with no product mention: r/productivity (~4.2M), r/gtd, r/ADHD (calm + plan-my-day resonates; make no medical claims), r/todoist and r/TickTick when someone asks for alternatives, r/ClaudeAI only once the MCP server exists. Read each sidebar's rules live before posting; several ban promo. Reactivate the Reddit monitor to Slack so you answer within the hour on "is there an app that…" threads.
- **X build-in-public**: 3 posts/week, screenshots and numbers, not philosophy. Compounds slowly; start now so it exists by launch.
- **Blog**: one post per week, half GTD long-tail (already ranking a little), half plan-my-day / ADHD-friendly / calendar-first intent.
- **Czech angle**: you are a Czech founder with an IČO — a short post in Czech startup/indie groups and a CzechCrunch-style "solo founder builds" pitch costs nothing and gets a local backlink.

### Step 5 — launch moments (week 6–10, each gated)
- **Product Hunt** only when: Paddle live, ≥50 weekly-active strangers, ≥5 quotable testimonials, a 60 s video. Product Hunt in 2026 rewards engagement and new-to-PH traffic and punishes low-engagement listings; without a network it is high-variance. If those gates are not met by week 8, skip it and lean on Uneed/MicroLaunch/Smol Launch which keep listings visible for weeks.
- **Hacker News "Show HN"** with the MCP-server angle when that ships (solo dev, honest constraints, the technical story). Do not post the plain task app.
- **Tool Finder / Keep Productive $39 listing** — the only paid placement worth considering, once there is a conversion baseline to measure it against.

### What not to spend on
No paid ads until free→paid conversion is measured. No native apps. No email/password auth until a stranger asks. No new features for four weeks except what the first 20 users hit.

### Weekly scorecard (put it in a spreadsheet, five numbers)
Stranger sign-ins · onboarded % · created ≥3 tasks % · returned day 7 % · founder sales. Everything else is noise.
