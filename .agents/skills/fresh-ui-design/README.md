# fresh-ui-design

A Claude Code skill that pushes Claude away from the default "shadcn on white" aesthetic toward modern, distinctive SaaS dashboard UIs built with React + Tailwind.

## What it does

When you ask Claude Code to build a dashboard, admin panel, form, table, or any React + Tailwind UI, this skill activates and guides it to:

- Pick a clear aesthetic direction (neo-modern glass, retro-futuristic/Y2K, or a hybrid) before writing code
- Use distinctive typography (Fontshare/Satoshi/Instrument Serif/Departure Mono instead of Inter)
- Build custom color palettes, shadows, and gradient meshes instead of Tailwind defaults
- Avoid the generic "AI slop" patterns (`bg-white` + `rounded-lg` + `shadow-md` + blue primary)
- Add signature details (custom empty states, iridescent accents, glass cards with proper inner highlights)

## Installation

### Option A — User-level (available in every project)

```bash
mkdir -p ~/.claude/skills
cp -r fresh-ui-design ~/.claude/skills/
```

### Option B — Project-level (checked into one repo)

```bash
mkdir -p .claude/skills
cp -r fresh-ui-design .claude/skills/
```

Restart Claude Code and it will pick up the skill automatically.

## How to verify it's working

Ask Claude Code something like "build me a dashboard for a team's productivity metrics". You should see it:

1. Name an aesthetic direction in the first sentence ("I'll build this as neo-modern glass…")
2. Set up design tokens (CSS variables + Tailwind config extensions) before components
3. Use a distinctive font loaded from Fontshare, Google Fonts, or similar
4. Produce a layout that isn't four identical cards in a row

If it still produces a generic shadcn-on-white dashboard, the skill didn't trigger — check your install path and try a more direct prompt like "use the fresh-ui-design skill to build…".

## Structure

```
fresh-ui-design/
├── SKILL.md                        Main entry point — always loads on trigger
└── references/
    ├── neo-modern-glass.md         Linear/Arc/Raycast aesthetic recipes
    ├── retro-futuristic.md         Y2K / Aqua / chrome aesthetic recipes
    ├── hybrid.md                   How to mix the two tastefully
    └── dashboard-patterns.md       SaaS-specific patterns: sidebar, KPI, tables, charts
```

Claude reads only the reference files relevant to the current task, which keeps context usage low.

## Tuning it

If you find Claude:

- **Not triggering the skill on a given prompt** — edit the `description:` field in `SKILL.md` frontmatter to include the specific phrases you use. The description is the triggering mechanism.
- **Leaning too heavy into one aesthetic** — edit the "pick a direction" section of `SKILL.md` to weight your preferences or remove directions you never want.
- **Missing a specific pattern you use a lot** — add it to `references/dashboard-patterns.md` with a recipe.

Skills are just markdown — edit them freely.
