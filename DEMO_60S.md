# Cleartable — 60-Second Landing Page Video

Target length: **60s exactly**. Lands above the fold on cleartable.app. One unbroken screen recording, voiceover added in post.
Resolution: 1920×1080. Browser zoom 110% so text reads on small embeds.

**Why 60s, not 90s:** Landing page retention curves drop hard after the first minute. The 60s cut is the conversion asset; the 90s DEMO.md is the YouTube / onboarding-email cut.

---

## Setup before recording

```bash
# from repo root
node server/scripts/seed-demo.js --user you@example.com --reset
```

Wipes and seeds:
- 4 active projects (one sequential, three parallel)
- Inbox with 6 unprocessed items
- Next Actions across 3 contexts
- 2 waiting-for items
- 3 completed items today (so dashboards aren't empty)
- Time blocks for today + tomorrow (so the calendar looks lived-in)
- A few stale items > 14 days old (for the weekly review beat)

Open the app, press **Cmd-R**, then start recording at the **Today** screen.

---

## Shot list (60 seconds, 5 beats)

### Shot 1 — Hook (0:00–0:04) · 4s
**Screen:** Today view, full of tasks. Cursor hovers the capture bar. Brief 1s of just the populated UI before voiceover starts.
**Voiceover:** *"Most task apps store your tasks. Cleartable processes them."*

> Why this opens: the first 3 seconds decide whether someone watches the rest. Lead with the wedge, not the welcome.

### Shot 2 — Smart Capture with auto-scheduling (0:04–0:16) · 12s
**Action:** Type into capture: `find me 30 min tomorrow afternoon to review the quarterly report`
**Screen:** Toast pops: *"Booked Thu Apr 24 at 2:00pm (30m)"*. Auto-zoom on the toast for half a second, then back.
**Voiceover:** *"Type naturally. AI reads the date, the duration, and finds an open slot in your calendar."*

### Shot 3 — Calendar time blocking (0:16–0:30) · 14s
**Action:** Click **Calendar** in nav. Switch to **Day view**. Drag an unscheduled task from the sidebar onto a 10:00 slot. Resize it to 90 minutes.
**Screen:** Time block snaps into place. Cursor highlight on for this shot — drag-and-drop is the visual hero.
**Voiceover:** *"Drag tasks onto the day. Snap to fifteen minutes, resize to fit. Pushes to a dedicated Google Calendar — your primary stays untouched."*

### Shot 4 — Inbox processing with AI (0:30–0:44) · 14s
**Action:** Click **Inbox**. Inbox has 6 items. Click **Process with AI**.
**Screen:** AI suggestions appear with confidence levels (high/medium). Click **Apply all**. Items animate out into their destinations.
**Voiceover:** *"Don't decide alone. The AI sorts your inbox into next actions, waiting fors, and someday — with confidence levels you can override."*

### Shot 5 — Weekly review flash (0:44–0:52) · 8s
**Action:** Click **Weekly Review**. Quick pan across stale items section and projects-needing-attention. No clicks — just let the screen breathe.
**Voiceover:** *"Sunday reviews in five minutes. Stale tasks surface, stuck projects get flagged."*

### Shot 6 — Close (0:52–1:00) · 8s
**Screen:** Logo + URL: `cleartable.app`. Hold steady. Optional: faint fade-in of the tagline below the URL.
**Voiceover:** *"Cleartable. Clear your table. Clear your mind. cleartable.app."*

---

## Voiceover script (paste into Loom / ScreenStudio)

> Most task apps store your tasks. Cleartable processes them.
>
> Type naturally. AI reads the date, the duration, and finds an open slot in your calendar.
>
> Drag tasks onto the day. Snap to fifteen minutes, resize to fit. Pushes to a dedicated Google Calendar — your primary stays untouched.
>
> Don't decide alone. The AI sorts your inbox into next actions, waiting fors, and someday — with confidence levels you can override.
>
> Sunday reviews in five minutes. Stale tasks surface, stuck projects get flagged.
>
> Cleartable. Clear your table. Clear your mind. cleartable.app.

**Word count:** ~90 words. At a relaxed VO pace (150 wpm) that's ~36s of speech inside a 60s video — leaves room for breathing, transitions, and a beat or two of pure visual.

---

## Why this cut order (GTM rationale)

The order is **not** a feature tour. It's a conversion funnel compressed into a minute:

1. **Hook** — names the wedge ("processes, not stores") in the first 4 seconds. Anyone who's used Todoist and felt overwhelmed feels seen here.
2. **Smart capture** — lowest-friction wow moment. One typed line produces a calendar booking. Universal value — even non-GTD viewers get it.
3. **Time blocking** — the visual hero. Drag-drop on a calendar is the most "I want to use that" frame in the whole video.
4. **AI inbox** — your main differentiator vs Todoist/TickTick. This is the buy-it beat for GTD-curious users who've tried processing manually and bounced.
5. **Weekly review flash** — signals depth without slowing pace. GTD purists notice it; everyone else absorbs "this app has structure."
6. **Close** — domain twice (text + voiceover) for recall.

What I cut from the 90s version:
- **Reduced hook from 8s → 4s.** The original hook lingered. On a landing page, lingering = bounce.
- **Smart capture 17s → 12s.** The toast already does the work; the voiceover doesn't need to.
- **Calendar 17s → 14s.** Trimmed the second drag and the resize commentary — visual carries it.
- **Inbox 20s → 14s.** Cut the second confidence-level callout.
- **Weekly review 18s → 8s.** Demoted from feature beat to credibility flash. The full weekly-review story belongs in onboarding email #3, not the landing page.
- **Close 10s → 8s.** Same content, tighter cut.

---

## Recording tips

- **Hide the dock and notifications.** macOS: System Settings → Notifications → Do Not Disturb.
- **Use Loom or Screen Studio** for instant cuts and zoom-on-click.
- **Cursor highlights:** on for Shot 3 (drag-and-drop) — that's the visual hero.
- **Cut tightly.** Trim ~200ms gaps between actions; viewers leave when nothing's happening.
- **Background music** at -20dB. Suggested: lofi piano or ambient (royalty-free on Mixkit).
- **First-frame test:** pause the video at 0:01. If that frame doesn't sell the app on its own, re-pick it. Landing page video previews are static.

---

## After the recording

- Export at 1080p, H.264, **< 4 MB** for fast landing page load. (Heavier video = slower Largest Contentful Paint = lower conversion.)
- Add captions — Loom auto-generates, edit for technical terms. **75% of landing-page-video viewers watch muted on first pass** — captions are not optional.
- Poster image: pick frame around 0:18 (the calendar drag with cursor mid-motion). Static previews should imply motion.
- Drop the MP4 + poster + .vtt captions into `landing-page/` and embed.

---

## Embed recommendation

Use a custom `<video>` tag, not an iframe. Loom and YouTube embeds add 200–600KB of JS and hand control to a third party.

```html
<video
  src="/cleartable-60s.mp4"
  poster="/cleartable-60s-poster.jpg"
  controls
  preload="metadata"
  playsinline
  width="1280"
  height="720">
  <track kind="captions" src="/cleartable-60s.vtt" srclang="en" default>
</video>
```

`autoplay` is tempting but autoplaying landing page videos hurt conversions in most A/B tests — let the user choose. Make the play button big and inviting instead.
