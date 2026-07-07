# Dashboard Patterns

SaaS dashboards share a skeleton: sidebar + topbar + main content grid with KPI cards, tables, and charts. This file covers each pattern and how to give it personality without breaking usability.

## Overall layout

Don't default to "sidebar 240px + main fluid". Options that feel fresher:

### Collapsible chunky sidebar (recommended default)
- 72px collapsed, 280px expanded
- Icon-only in collapsed state, icon + label when expanded
- Smooth width transition (300ms)
- User avatar + org switcher at the top, not the bottom
- Primary nav grouped into 2-3 sections with tracked-out uppercase mono labels between groups

### Floating command bar instead of topbar
- Instead of a topbar, use a floating centered command bar (like Arc or Raycast). Search + primary actions.
- Position: `fixed top-4 left-1/2 -translate-x-1/2`
- Glass card styling
- Activates on `⌘K`

### Content max-width
- Don't use `max-w-7xl` centered. That's the generic move.
- Either: full-bleed with internal padding (`px-8 lg:px-12`), or asymmetric grids where hero content is wider than secondary.
- Leave breathing room at the top — `pt-10` minimum on main content, not `pt-6`.

## KPI cards

Generic: 4 cards in a row, label on top, number in middle, % change on bottom, all identical.

Fresher patterns:

### Asymmetric bento
- One large "hero" KPI (2x width or 2x height) and 3-4 smaller ones around it.
- The hero gets the gradient-fill mono number, the others get restrained styling.
- Use `grid-cols-4 grid-rows-2` with `col-span-2 row-span-2` on the hero.

### Inline sparkline KPIs
- Number on the left, compact sparkline filling the right 60% of the card.
- Sparkline in the accent color with a soft glow beneath it.
- Use Recharts `<Area>` or a tiny hand-rolled SVG path.

### Delta-first KPIs
- Lead with the change ("+12.4%") in large type, actual value smaller below.
- Good for "is this going up or down" dashboards.

### Signature details
- Tracked-out uppercase mono label: `text-[0.65rem] tracking-[0.2em] uppercase font-mono text-zinc-500`
- Number: `tabular-nums` so digits don't jitter
- Icon top-right at 30-40% opacity, not next to the label
- Subtle top-border accent in the KPI's color (health = green, revenue = violet)

## Tables

Generic shadcn table = gray lines, alternating rows, tiny text. Avoid.

### Styling
- No row dividers. Use generous vertical padding (`py-4` minimum) instead.
- Or: very subtle dividers at `border-white/5` (dark) or `border-slate-900/5` (light).
- Column headers: small, mono, uppercase, tracked-out. Not bold sans.
- Hover row: background shifts to `bg-white/[0.02]` (dark) with slight scale on content, not whole row.
- First column often gets accent treatment (avatar + name stack, or icon + title).

### Status badges
- Don't use solid-color pills with white text.
- Use: tinted background + matching text + subtle border. Example: `bg-emerald-500/10 text-emerald-300 border border-emerald-500/20`.
- Pair with a tiny dot indicator before the text.

### Empty tables
- Do not show an empty striped table. Show a real empty state with a retro pixel illustration, mono copy, and a single chrome CTA.

### Actions column
- Three-dot menu is overused. Try: two or three actual icon buttons that appear on row hover, or a right-arrow on hover that reveals more on click.

## Charts

Defaults to avoid: Recharts default colors (teal + orange), flat line with dots at every point, y-axis with 6 ticks, legend at the top.

### Styling for Recharts
```jsx
<AreaChart data={data}>
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
    </linearGradient>
  </defs>
  <CartesianGrid
    stroke="rgba(255,255,255,0.04)"
    strokeDasharray="3 6"
    vertical={false}
  />
  <XAxis
    tickLine={false}
    axisLine={false}
    tick={{ fontFamily: 'Geist Mono', fontSize: 11, fill: '#71717a' }}
  />
  <YAxis
    tickLine={false}
    axisLine={false}
    tick={{ fontFamily: 'Geist Mono', fontSize: 11, fill: '#71717a' }}
  />
  <Area
    type="monotone"
    dataKey="value"
    stroke="#a78bfa"
    strokeWidth={2}
    fill="url(#gradient)"
    dot={false}
    activeDot={{ r: 5, fill: '#a78bfa', strokeWidth: 2, stroke: '#0a0a0f' }}
  />
</AreaChart>
```

Key choices: no y-axis line, no vertical grid, horizontal dashed grid only, no dots on the line (only on hover), mono tick labels. The gradient fill + thin stroke = signature neo-modern look.

### Chart sizing
- Don't make charts tiny. Give them `h-64` or more on the primary card.
- Respect the design system's color — if the dashboard's accent is violet, don't put a teal line in it because that's Recharts' default.

## Sidebar

### Structure
```
[logo + product name]      <- 56px height, accent color on logo

[Primary org/workspace switcher]  <- glass pill, avatar + name + chevron

[Search or ⌘K trigger]            <- shows keybind hint on the right

--- NAVIGATION ---     (tracked-out uppercase mono label)
[icon] Dashboard
[icon] Inbox       (3)  <- count badge
[icon] Projects

--- SETTINGS ---
[icon] Members
[icon] Billing

[user card at bottom]    <- avatar + name + status dot + settings cog
```

### Active state
- Not just bg-color. Combine: subtle bg tint + left accent bar + icon color shift + slight left indent.
- Example: `bg-violet-500/10 border-l-2 border-violet-400 text-violet-100 pl-[14px]` (pl compensating for the border).

### Hover state
- bg tint at half the active opacity, no border.
- Smooth transition.

## Forms

### Input styling
Don't do `border border-gray-300 rounded-md px-3 py-2`. Try:

```jsx
<input
  className="
    w-full rounded-xl
    bg-white/[0.03] border border-white/[0.08]
    px-4 py-3
    text-sm text-zinc-100 placeholder:text-zinc-500
    focus:bg-white/[0.05] focus:border-violet-500/50 focus:outline-none
    focus:shadow-[0_0_0_4px_rgba(124,58,237,0.1)]
    transition-all duration-200
  "
/>
```

### Labels
- Above input, small, mono, tracked-out, lowercase or small-caps.
- Optional: place a small icon to the left of the label.

### Error states
- Not red border + red text below. Use: amber-tinted border + small icon + helper text in amber at 70% opacity.

## Empty states (high leverage!)

Empty states are where most dashboards look most generic. Invest effort here.

- Don't use the default "No data" with a generic line-art icon from Lucide.
- Options: pixel illustration, ASCII divider, mono copy with personality, a single styled CTA.
- Example mono copy:
  ```
  no_projects_found
  ─────────────────
  create your first project to get started
  [ + new project ]
  ```
- For neo-modern, use a soft radial glow behind the empty state content, a distinctive display-font headline, then calm body copy.

## Modals / Dialogs

- Don't use shadcn Dialog with default styling. Restyle the overlay (blurred + tinted, not just black-50).
- Entry animation: scale from 0.96 + fade + slight y offset. Not scale from 0.
- Glass card styling inside, larger rounded radius (`rounded-3xl`).
- Close button as a small outlined circle top-right, with keybind hint (`esc`) to the left of it in mono.

## Data density

Dashboards often oscillate between "too sparse" (five cards on a massive canvas) and "too dense" (spreadsheet hell). Aim for rhythm: dense information blocks separated by generous vertical whitespace between sections. Use section headers with tracked-out mono labels to mark zones.

## Responsive

- Sidebar collapses to a bottom tab bar on mobile, not a hamburger drawer. Feels more native.
- Or a floating command bar that replaces navigation entirely on mobile.
- KPI bento grids stack to 1 column on mobile, 2 on tablet.
- Tables should horizontally scroll gracefully, not squash. Fade out the right edge to hint at overflow.

## The "is this actually fresh?" checklist

Before finishing, verify:
- [ ] Typography is not Inter/Roboto only — there's a distinctive display or mono font doing work
- [ ] Color palette has a clear mood, not just "light" or "dark"
- [ ] At least 2 custom shadows defined and used
- [ ] KPI cards are not 4 identical cards in a row
- [ ] Tables don't look like default shadcn tables
- [ ] Charts use custom colors that match the palette
- [ ] At least one signature detail that's specific to this UI and would not appear in a template
- [ ] Empty state is designed, not defaulted

If any two are unchecked, go back and fix them.
