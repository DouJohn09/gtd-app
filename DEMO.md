# GTD Flow — 90-Second Demo Storyboard

Target length: **75-90s**. One unbroken screen recording, voiceover added in post.
Resolution: 1920×1080. Browser zoom 110% so text reads on small embeds.

---

## Setup before recording

```bash
# from repo root
node server/scripts/seed-demo.js --user you@example.com --reset
```

This wipes your tasks/projects and seeds a realistic GTD state:
- 4 active projects (one sequential, three parallel)
- Inbox with 6 unprocessed items
- Next Actions across 3 contexts
- 2 waiting-for items
- 3 completed items today (so the dashboard isn't empty)
- Time blocks for today + tomorrow (so the calendar looks lived-in)

Open the app, press **Cmd-R**, then start recording at the **Today** screen.

---

## Shot list

### Shot 1 — Hook (0:00-0:08)
**Screen:** Today view, full of tasks. Cursor hovers the capture bar.
**Voiceover:** *"Most task apps store your tasks. GTD Flow processes them."*

### Shot 2 — Smart Capture with auto-scheduling (0:08-0:25)
**Action:** Type into capture: `find me 30 min tomorrow afternoon to review the quarterly report`
**Screen:** Toast pops: *"Booked Thu Apr 24 at 2:00pm (30m)"*
**Voiceover:** *"Type naturally. AI reads the date, the duration, and finds an open slot in your calendar."*

### Shot 3 — Calendar time blocking (0:25-0:42)
**Action:** Click **Calendar** in nav. Switch to **Day view**. Drag an unscheduled task from the sidebar onto a 10:00 slot. Resize it to 90 minutes.
**Screen:** Time block snaps into place.
**Voiceover:** *"Drag tasks straight onto the day. Snap to fifteen minutes, resize to fit. Everything pushes to a dedicated Google Calendar — your primary stays untouched."*

### Shot 4 — Inbox processing with AI (0:42-1:02)
**Action:** Click **Inbox**. Inbox has 6 items. Click **Process with AI** button.
**Screen:** AI suggestions appear with confidence levels (high/medium). Click **Apply all**.
**Voiceover:** *"Don't decide alone. The AI sorts your inbox into next actions, waiting fors, and someday — and tells you how confident it is."*

### Shot 5 — Weekly review (1:02-1:20)
**Action:** Click **Weekly Review**. Show stale items section. Show projects-needing-attention.
**Voiceover:** *"Sunday review takes five minutes. Stale tasks surface, stuck projects get flagged, and the AI proposes follow-ups."*

### Shot 6 — Close (1:20-1:30)
**Screen:** Logo + URL: `gtdflow.app`
**Voiceover:** *"GTD Flow. Free to start. gtdflow.app."*

---

## Voiceover script (paste into Loom/ScreenStudio)

> Most task apps store your tasks. GTD Flow processes them.
>
> Type naturally. AI reads the date, the duration, and finds an open slot in your calendar.
>
> Drag tasks straight onto the day. Snap to fifteen minutes, resize to fit. Everything pushes to a dedicated Google Calendar — your primary stays untouched.
>
> Don't decide alone. The AI sorts your inbox into next actions, waiting fors, and someday — and tells you how confident it is.
>
> Sunday review takes five minutes. Stale tasks surface, stuck projects get flagged, and the AI proposes follow-ups.
>
> GTD Flow. Free to start. gtdflow.app.

---

## Recording tips

- **Hide the dock and notifications.** macOS: System Settings → Notifications → Do Not Disturb.
- **Use Loom or Screen Studio** for instant cuts and zoom-on-click.
- **Cursor highlights:** turn on in Screen Studio for the drag-and-drop shots — they're the visual hero.
- **Cut tightly.** Trim the gaps between actions; viewers leave when nothing's happening.
- **Background music** at -20dB. Suggested: lofi piano or ambient (royalty-free on Mixkit).

---

## After the recording

- Export at 1080p, H.264, ~5-10 MB if possible (for fast landing page load).
- Add captions — Loom auto-generates, edit for the technical terms.
- Drop the MP4 (and a poster image) into `landing-page/` and embed.
