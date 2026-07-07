# Hybrid: Neo-Modern Glass + Y2K Accents

The strategy: use neo-modern glass as the **foundation** (all the structural components, backgrounds, typography, spacing), and introduce Y2K elements only as **hero accents** on a small number of signature moments. Done right, this gets you the calm and scalability of neo-modern with the distinctive material personality of Y2K.

Read `neo-modern-glass.md` first for the base. This file only covers the Y2K accents you layer on top.

## Where to put Y2K accents

Keep it to 2-3 moments per view. More than that and it stops being an accent.

1. **The primary KPI / hero number** — give it the gradient-fill monospace treatment with the big mono number and tracked-out uppercase label.
2. **The primary CTA button** — chrome button instead of the standard gradient button.
3. **One "featured" card** on a dashboard — iridescent animated border instead of the standard glass border.
4. **Empty states** — lean retro hard here. ASCII art or pixel illustrations, mono copy, chrome refresh button. Empty states are low-stakes and high-memorability.
5. **Loading states** — a scanline sweep or iridescent shimmer instead of a skeleton pulse.

## What to keep neo-modern

- Overall background (aurora mesh, not iridescent wash)
- Sidebar and topbar structure and styling
- Standard cards (glass, not plastic)
- Form inputs and secondary buttons
- Tables and data density

The rule of thumb: **structure = neo-modern. Spectacle = Y2K.**

## Palette

Start from a neo-modern palette (Midnight aurora works well as a base because violet transitions naturally into iridescent), then add:

```css
--accent-chrome-gradient: linear-gradient(180deg, #ffffff 0%, #d4d7e5 50%, #a8abc0 100%);
--accent-iridescent: linear-gradient(120deg, #a5b4fc, #c4b5fd, #f0abfc, #a5b4fc);
--accent-lime: #bef264;  /* for small acid pops */
```

## Typography

Use the neo-modern body font (Inter Tight / Geist), but bring in a distinctive mono for all the Y2K accent moments — specifically **Departure Mono** or **Berkeley Mono** / **Commit Mono**. The mono font shows up on:
- Primary KPIs
- Tracked-out uppercase labels
- Terminal-style timestamps
- The chrome button label

Don't use the display serif (Instrument Serif) in hybrid — it fights with the Y2K accents. Keep the display typography simple so the material accents can do the work.

## Composition guideline

Visualize the hierarchy: calm dark aurora background → calm glass cards → then ONE chrome-iridescent moment in the eyeline. The eye should rest on the glass and then get drawn to the accent. If three things are competing for attention, you've added too much Y2K.

## Motion

- Keep neo-modern's staggered-entrance pattern for the overall page.
- Add a one-time iridescent shimmer *once* across the hero element on page load.
- The iridescent border animation (8 second loop) is fine because it's subtle.
- Don't combine the aurora mesh motion WITH iridescent border motion WITH number count-ups WITH cursor followers — pick two, max.

## Example composition for a dashboard

- Background: midnight aurora mesh (from neo-modern)
- Sidebar: glass surface, violet accent on active item
- Topbar: glass, Geist body font
- Hero KPI card: iridescent animated border, mono gradient-fill number inside
- Secondary KPI cards: standard glass cards with small accent badges
- Primary action button in topbar: chrome button
- Charts: neo-modern styling, violet lines
- Empty state (if any): retro-coded, mono text, ASCII divider

That's the target. Three Y2K moments (hero KPI, CTA, empty state), everything else is neo-modern.
