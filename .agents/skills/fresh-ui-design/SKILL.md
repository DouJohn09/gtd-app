---
name: fresh-ui-design
description: Build React + Tailwind SaaS dashboards and web app UIs with a modern, distinctive aesthetic instead of the default shadcn-on-white look. Use this skill whenever the user asks for a dashboard, admin panel, SaaS interface, data view, analytics UI, settings page, table, form, sidebar, navbar, modal, card layout, or any React component — even if they don't ask for "fresh" or "creative" design explicitly. Trigger on phrases like "build me a dashboard", "make a settings page", "design a UI for X", "create a component for Y", "style this page", "I need an admin panel", or any request to generate a React + Tailwind interface. Leans into glassmorphism/neo-modern and retro-futuristic/Y2K aesthetic families to avoid the generic "every AI dashboard looks the same" problem.
---

# Fresh UI Design for Codex

Your job with this skill: when the user asks you to build a React + Tailwind interface, **do not default to the shadcn-on-white aesthetic** (white cards, gray borders, blue primary button, Inter font, rounded-lg everywhere). That look is competent and boring. This skill pushes toward interfaces that feel *designed*, not assembled.

## The core rule: pick a direction before you write code

Before touching any JSX, decide on **one** of these aesthetic directions and commit fully. Mixing them produces mush.

1. **Neo-modern glass** — frosted surfaces, soft gradient backgrounds, generous blur, chromatic accents. Feels like Linear, Arc, Raycast, Vercel's newer work.
2. **Retro-futuristic / Y2K** — chrome, bevels, iridescent gradients, translucent plastic, pixel-perfect monospace, blurred halos, scanlines. Feels like Apple Aqua reborn, Frog Design, early 2000s Winamp.
3. **Hybrid** — Y2K chrome/gradients on a neo-modern glass foundation. Harder to pull off but very distinctive when it works.

Pick one in the first breath of your response, name it, then execute. Don't ask the user to pick unless they've given zero aesthetic signals — confident direction beats safe consultation.

Read `references/neo-modern-glass.md` or `references/retro-futuristic.md` for the concrete recipes. Read `references/hybrid.md` only if you've chosen hybrid. Read `references/dashboard-patterns.md` whenever building a dashboard, admin, or data-heavy layout — it covers the SaaS-specific structure (sidebar, topbar, KPI cards, tables, charts) so you don't fall back to generic shadcn blocks.

## Hard don'ts (the "AI slop" checklist)

These are the defaults Codex reaches for when thinking isn't happening. Avoid all of them unless the user explicitly asks:

- **Font**: not Inter. Not Roboto. Not system-ui alone. Pair a distinctive display font with a refined body font — options in the reference files.
- **Color**: not `bg-white` + `text-gray-900` + `bg-blue-600` primary. Not a purple-to-pink gradient on white. Commit to a real palette with 2–3 dominant colors and a sharp accent.
- **Shape**: not `rounded-lg` everywhere with `border border-gray-200`. Pick a radius personality (sharp 2px, soft 12px, pill 9999px, or asymmetric) and hold it.
- **Shadow**: not the default `shadow-md` / `shadow-lg`. Custom shadows with colored tints, layered shadows, or inner glows.
- **Layout**: not a centered max-w-7xl container with three evenly-spaced cards. Use asymmetry, overlap, off-grid placement, bento layouts, or full-bleed sections.
- **Icons**: Lucide is fine but don't lean on it for personality — add custom SVG flourishes, gradients on icons, or unexpected icon choices.
- **Primary button**: not solid blue with white text and a subtle hover. Give the primary action weight, texture, or motion.

## Tech constraints (React + Tailwind specific)

- **Tailwind config**: extend `theme.extend` with custom colors, fonts, shadows, and animations. Don't rely on defaults. Always add the color palette and fonts as CSS variables in a global stylesheet too, so gradients and non-Tailwind CSS can reference them.
- **Fonts**: load via `next/font` (Next.js), `@fontsource` (Vite), or `<link>` to Google Fonts / Fontshare / Bunny Fonts. Fontshare has the most distinctive free options — use it.
- **Animation**: prefer `motion` (Framer Motion) for anything interactive. For simple transitions, Tailwind's `transition-*` + `animate-*` is enough. Add custom keyframes in `tailwind.config` for signature motion.
- **Glass effects**: `backdrop-blur-xl` + `bg-white/5` (dark mode) or `bg-white/60` (light mode) + a subtle border like `border-white/10`. Always layer over a gradient or noisy background — glass over flat white is pointless.
- **Gradient meshes**: use layered `radial-gradient` in inline style or a CSS variable. Tailwind's gradient utilities are linear-only.
- **shadcn/ui**: fine to use as structural primitives (Dialog, Popover, Command) but **always** restyle them. Default shadcn styling = the thing we're avoiding.

## Workflow

When the user asks for a UI:

1. **Read the dashboard-patterns reference** if it's a dashboard/admin/data UI. Skip if it's a marketing page or isolated component.
2. **Pick an aesthetic direction** (neo-modern glass / retro-futuristic / hybrid) and name it in one sentence to the user: "I'll build this as neo-modern glass — frosted cards on a soft gradient, Geist Mono accents, aurora background." Then read the matching reference file.
3. **Define the design tokens first**: colors, fonts, radii, shadows, spacing rhythm. Write these as CSS variables + Tailwind config extensions before any component code. This prevents mid-stream drift toward defaults.
4. **Build the layout skeleton**, then fill in components. Hold the aesthetic at every step — if you catch yourself writing `bg-white rounded-lg shadow-md border border-gray-200`, stop and re-read the reference.
5. **Add signature details**: at least two or three things that make this interface *this* interface and not a template. A custom cursor, a background animation, an unusual empty state, a weird-but-right use of typography, a transition that nobody else does.
6. **Sanity-check against the "AI slop" list** before finishing. If three or more items match, start over on the styling.

## On restraint

Fresh does not mean maximalist. A neo-modern dashboard can be calm and spacious — the freshness comes from *specific* choices (which gray, which radius, which micro-animation), not from cramming effects in. Retro-futuristic is where you can go heavier on texture and chrome. Match intensity to the aesthetic.

The user picked these aesthetic families because they want interfaces that feel alive and specific. Deliver that. Don't compromise into safe-and-generic at the last minute because a component "needs" to look professional — professional and distinctive are not in tension when the execution is tight.
