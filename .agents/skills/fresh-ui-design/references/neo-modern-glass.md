# Neo-Modern Glass

The aesthetic: frosted surfaces floating on soft gradient or aurora backgrounds. Generous blur, restrained color, one or two chromatic accents that pop against an otherwise calm palette. Think Linear, Arc browser, Raycast, Vercel's dashboard, Things 3.

## Palette recipes

Pick one. Don't mix and match — commit to a mood.

### "Midnight aurora" (dark, default recommendation)
```css
--bg-base: #0a0a0f;
--bg-elevated: #12121a;
--surface-glass: rgba(255, 255, 255, 0.04);
--surface-glass-hover: rgba(255, 255, 255, 0.07);
--border-subtle: rgba(255, 255, 255, 0.08);
--border-strong: rgba(255, 255, 255, 0.14);
--text-primary: #f5f5f7;
--text-secondary: #a1a1aa;
--text-muted: #52525b;
--accent-primary: #7c3aed;   /* violet, for primary actions */
--accent-glow: #a78bfa;      /* lighter, for glow/halo */
--accent-contrast: #f0abfc;  /* magenta pop, use sparingly */
```
Background: aurora mesh of violet + cyan + deep blue radial gradients, heavily blurred, at ~30% opacity.

### "Arctic linen" (light, refined)
```css
--bg-base: #fafaf9;
--bg-elevated: #ffffff;
--surface-glass: rgba(255, 255, 255, 0.6);
--surface-glass-hover: rgba(255, 255, 255, 0.8);
--border-subtle: rgba(15, 23, 42, 0.06);
--border-strong: rgba(15, 23, 42, 0.12);
--text-primary: #09090b;
--text-secondary: #52525b;
--text-muted: #a1a1aa;
--accent-primary: #0f172a;   /* near-black, for weight */
--accent-glow: #3b82f6;      /* sky, for highlights */
--accent-contrast: #f97316;  /* orange pop */
```
Background: very soft blue + peach radial gradients at low opacity, almost imperceptible.

### "Lagoon" (dark, saturated)
```css
--bg-base: #020617;
--bg-elevated: #0c1222;
--surface-glass: rgba(56, 189, 248, 0.04);
--border-subtle: rgba(56, 189, 248, 0.1);
--text-primary: #e0f2fe;
--text-secondary: #7dd3fc;
--accent-primary: #06b6d4;
--accent-glow: #22d3ee;
--accent-contrast: #f472b6;
```
Background: deep teal + indigo mesh with a hint of pink.

## Typography

Pick **one pair**. The display font carries the personality; the body font gets out of the way.

- **Display: Instrument Serif** (Fontshare) — sharp, editorial, italic has beautiful swashes. Pair with **Inter Tight** or **Geist** for body.
- **Display: Satoshi** (Fontshare) — geometric, slightly futuristic. Pair with **Geist Mono** for numeric data.
- **Display: General Sans** (Fontshare) — clean but characterful. Pair with **JetBrains Mono** for code/numbers.
- **Display: Söhne** / fallback **Inter Display** — if you want the Linear/Stripe feel. Pair with **IBM Plex Mono** for data.
- **Mono accent for numbers**: ALWAYS use a monospace for numeric data (KPIs, tables, timestamps). Choose **Geist Mono**, **JetBrains Mono**, or **Berkeley Mono** (paid, use Commit Mono as free alternative).

Load via Fontshare (`<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=general-sans@400,500,600&display=swap" rel="stylesheet">`) — most distinctive free options live there.

## Gradient mesh background (the signature element)

A flat `bg-[#0a0a0f]` is not enough. Layer radial gradients:

```jsx
<div className="fixed inset-0 -z-10">
  <div className="absolute inset-0 bg-[#0a0a0f]" />
  <div
    className="absolute inset-0 opacity-40"
    style={{
      background: `
        radial-gradient(circle at 20% 30%, rgba(124, 58, 237, 0.4), transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.3), transparent 50%),
        radial-gradient(circle at 60% 80%, rgba(236, 72, 153, 0.25), transparent 50%)
      `,
    }}
  />
  {/* Optional: grain overlay */}
  <div
    className="absolute inset-0 opacity-[0.015] mix-blend-overlay"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    }}
  />
</div>
```

For *extra* signature: animate the mesh slowly. Keyframes that shift the gradient positions over 30–60 seconds give the background a living feel.

## Glass card recipe

```jsx
<div
  className="
    rounded-2xl border border-white/[0.08]
    bg-white/[0.03] backdrop-blur-xl
    shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.06)]
    p-6
    transition-all duration-300
    hover:bg-white/[0.05] hover:border-white/[0.12]
  "
>
  ...
</div>
```

Key bits people miss:
- `inset 0 1px 0 0 rgba(255,255,255,0.06)` — the inner top highlight. This is what makes glass look like glass and not a translucent rectangle.
- Border opacity at 0.08, not a solid color.
- Hover state shifts *both* bg and border opacity — glass should feel responsive.

## Shadow personality

Ditch Tailwind's shadow defaults. Add custom ones to `tailwind.config.js`:

```js
boxShadow: {
  'glow-violet': '0 0 40px -10px rgba(124, 58, 237, 0.5)',
  'glass-sm': '0 4px 16px -6px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
  'glass-md': '0 8px 32px -12px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
  'glass-lg': '0 20px 60px -20px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
  'soft-lift': '0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
}
```

## Motion personality

- **Entrances**: staggered fade-up on page load, 40ms delay between items, 400ms duration, easing `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Hovers**: 200ms, shift bg opacity + translate-y by 1–2px. Not scale — scale feels cheap.
- **Focus**: glow ring using the accent color at low opacity (`0 0 0 4px rgba(124, 58, 237, 0.15)`). No blue default ring.
- **Signature motion**: one thing that moves on its own — the gradient mesh, a subtle cursor-follower glow, or a breathing logo. One, not five.

## Primary button

Don't do solid-accent-with-white-text. Try:

```jsx
<button
  className="
    group relative overflow-hidden
    rounded-xl px-5 py-2.5
    bg-gradient-to-b from-violet-500 to-violet-700
    text-white text-sm font-medium
    shadow-[0_2px_8px_-2px_rgba(124,58,237,0.5),inset_0_1px_0_0_rgba(255,255,255,0.2)]
    hover:shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6),inset_0_1px_0_0_rgba(255,255,255,0.25)]
    transition-all duration-200
  "
>
  <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
  <span className="relative">Continue</span>
</button>
```

The top-to-bottom gradient + inner highlight gives the button a physical, pressable feel. Solid-color buttons are for 2015.

## Icons

Lucide is the baseline. Elevate it:
- Wrap icons in a small glass badge: `<div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2"><Icon className="w-4 h-4 text-violet-300" /></div>`
- For KPI cards, put the icon in the top-right corner with 40% opacity, not next to the label.
- For the sidebar nav, use outlined icons at normal state and filled/gradient at active state.

## When to break these rules

If the user asks for "light mode", flip to "Arctic linen" — don't try to force dark-mode recipes into light. If they say "calm" or "minimal", drop the aurora mesh and use the softest palette with 30% of the effects. If they say "punchy" or "bold", crank the accent contrast and add the Y2K hybrid touches from `hybrid.md`.
