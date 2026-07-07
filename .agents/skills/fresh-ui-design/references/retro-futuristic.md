# Retro-Futuristic / Y2K

The aesthetic: chrome, bevels, iridescent gradients, translucent plastic, pixel-perfect monospace, scanlines, blurred halos. Think Apple Aqua reborn, Frog Design, early-2000s Winamp, Panic's Playdate UI, recent Spline / Vercel OSS / new.css-style throwbacks. For a SaaS dashboard this is riskier but *unforgettable* when done right.

Do not do this as a costume — nobody wants a dashboard that looks like a Geocities page. The move: Y2K *materials and light* applied to a modern SaaS skeleton. Chrome buttons, iridescent accents, translucent plastic panels, but clean typography and real information hierarchy.

## Palette recipes

### "Chrome dream" (signature)
```css
--bg-base: #e8eaf2;             /* warm off-white-gray */
--bg-gradient-top: #f0e7ff;
--bg-gradient-bottom: #c7d2fe;
--surface-plastic: rgba(255, 255, 255, 0.55);
--surface-chrome: linear-gradient(180deg, #ffffff 0%, #d4d7e5 50%, #a8abc0 100%);
--border-subtle: rgba(15, 23, 42, 0.08);
--border-metallic: linear-gradient(180deg, #ffffff, #8b91a8);
--text-primary: #0f172a;
--text-secondary: #475569;
--accent-iridescent: linear-gradient(120deg, #a5b4fc, #c4b5fd, #f0abfc, #fbcfe8, #a5b4fc);
--accent-lime: #bef264;         /* acid pop */
--accent-hot: #f472b6;          /* candy pink */
```

### "Deep space Aqua" (dark Y2K)
```css
--bg-base: #0b0d1a;
--bg-gradient: radial-gradient(ellipse at top, #1e1b4b, #0b0d1a 60%);
--surface-plastic: rgba(99, 102, 241, 0.08);
--surface-chrome: linear-gradient(180deg, #4f46e5 0%, #1e1b4b 50%, #4338ca 100%);
--border-glow: rgba(165, 180, 252, 0.4);
--text-primary: #e0e7ff;
--text-secondary: #a5b4fc;
--accent-iridescent: linear-gradient(120deg, #22d3ee, #a78bfa, #f0abfc, #22d3ee);
--accent-lime: #a3e635;
```

### "Bubblegum interface"
```css
--bg-base: #fef3f9;
--bg-gradient: radial-gradient(ellipse at top left, #fbcfe8, #e0f2fe 50%, #fef3f9);
--surface-plastic: rgba(255, 255, 255, 0.7);
--border-subtle: rgba(219, 39, 119, 0.12);
--text-primary: #500724;
--accent-primary: #ec4899;
--accent-iridescent: linear-gradient(120deg, #fda4af, #d8b4fe, #a5f3fc, #fda4af);
```

## Typography

Y2K typography is half the aesthetic. Rules:

- **Display font**: pick something with personality — not a generic geometric sans.
  - **Departure Mono** (Fontshare) — pixel-perfect mono with Y2K character. Perfect.
  - **PP Neue Bit** (Pangram Pangram) — pixel display, free for personal.
  - **Redaction** (Fontshare) — distressed serif, very editorial-Y2K.
  - **Author** (Klim, paid) or **Canela Text** — if you want refined retro.
- **Body font**: keep readable — **Inter Tight**, **Söhne**, or **General Sans**.
- **Mono for data**: **Departure Mono**, **Berkeley Mono** (paid, or **Commit Mono** free), **JetBrains Mono**.

Use monospace heavily — on labels, timestamps, numbers, even small section headers. The mono-everywhere move is signature Y2K revival.

## Background: iridescent wash

```jsx
<div className="fixed inset-0 -z-10">
  <div
    className="absolute inset-0"
    style={{
      background: `
        radial-gradient(ellipse 80% 60% at 20% 10%, #f0abfc55, transparent),
        radial-gradient(ellipse 70% 50% at 80% 0%, #a5b4fc66, transparent),
        radial-gradient(ellipse 90% 70% at 50% 100%, #bae6fd55, transparent),
        linear-gradient(180deg, #f0e7ff, #e0e7ff 40%, #fce7f3)
      `,
    }}
  />
  {/* Scanlines — subtle */}
  <div
    className="absolute inset-0 opacity-[0.04] pointer-events-none"
    style={{
      backgroundImage:
        'repeating-linear-gradient(0deg, #000 0px, #000 1px, transparent 1px, transparent 3px)',
    }}
  />
  {/* Grain */}
  <div
    className="absolute inset-0 opacity-[0.03] mix-blend-multiply pointer-events-none"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    }}
  />
</div>
```

## Translucent plastic card

This is the Aqua move. Don't overdo the gloss.

```jsx
<div
  className="
    relative overflow-hidden
    rounded-2xl
    bg-white/55 backdrop-blur-2xl
    border border-white/60
    shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset,0_20px_40px_-20px_rgba(79,70,229,0.25),0_4px_12px_-4px_rgba(15,23,42,0.08)]
  "
>
  {/* Gloss highlight on top half */}
  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
  <div className="relative p-6">
    {children}
  </div>
</div>
```

The three-layer shadow is doing the heavy lifting — inset white on top (plastic highlight), colored shadow below (the violet tint = iridescence), standard drop shadow for grounding.

## Chrome button

```jsx
<button
  className="
    relative overflow-hidden
    rounded-full px-5 py-2
    font-mono text-sm tracking-wide text-slate-800
    shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_-1px_0_0_rgba(0,0,0,0.1)_inset,0_2px_4px_rgba(0,0,0,0.1)]
    active:shadow-[0_1px_2px_rgba(0,0,0,0.15)_inset]
    transition-all
  "
  style={{
    background:
      'linear-gradient(180deg, #ffffff 0%, #e5e7eb 45%, #cbd5e1 55%, #f1f5f9 100%)',
  }}
>
  <span className="absolute inset-x-2 top-0 h-1/2 rounded-full bg-white/60 blur-sm" />
  <span className="relative">Execute</span>
</button>
```

The trick: sharp gradient transition at 45%/55% gives the chrome crease, the blurred white strip on top is the reflection, the active state removes the "raised" shadow and replaces with inset (pressed).

## Iridescent accent elements

Use sparingly — one or two per view, otherwise it becomes a unicorn vomit.

```jsx
{/* Iridescent border */}
<div
  className="rounded-2xl p-[1.5px]"
  style={{
    background:
      'linear-gradient(120deg, #a5b4fc, #c4b5fd, #f0abfc, #fbcfe8, #a5b4fc)',
    backgroundSize: '200% 200%',
    animation: 'iridescent 8s ease infinite',
  }}
>
  <div className="rounded-2xl bg-white/80 backdrop-blur-xl p-6">
    {children}
  </div>
</div>
```

```css
@keyframes iridescent {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```

## KPI numbers

Big, monospace, with a subtle gradient fill. This is where you can go dramatic:

```jsx
<div
  className="font-mono text-5xl font-medium tabular-nums tracking-tight"
  style={{
    background: 'linear-gradient(180deg, #0f172a 0%, #4f46e5 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
>
  24,812
</div>
<div className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500 mt-1">
  active_users ↗ +12.4%
</div>
```

The `tabular-nums` + mono + tracked-out uppercase label = signature Y2K SaaS.

## Motion personality

- **Boot sequence feel**: on page load, have elements "come online" — a subtle scanline sweep across the viewport, then staggered reveals.
- **Cursor**: consider a custom cursor (a small chrome ring) on key areas. Don't do this everywhere.
- **Hover on plastic cards**: increase backdrop-blur, slight lift (`-translate-y-0.5`), add a soft glow. No scale.
- **Iridescent borders**: animated gradient position loop, 6–10 seconds, infinite.
- **Number counters**: count up from 0 on first paint using Motion's `useSpring` or `framer-motion/react`.

## Danger zones

Things that tip Y2K from "fresh retro-futurism" into "costume party":
- Comic Sans or MS Sans Serif (unless you're being ironic and the user is in on it)
- Loud rainbow chrome text for headings
- Window chrome with fake title bars and minimize buttons (unless that's the whole bit)
- Beveled everything — chrome edges on every single element is too much
- Emoji overload — Y2K didn't have emoji, it had custom glyphs

Keep the structure and information hierarchy *modern SaaS* — a tidy sidebar, clear topbar, readable tables. The Y2K is in the **materials and light**, not the UX patterns.

## Hybrid mode

If the user wants something in between, see `hybrid.md` — it covers using neo-modern glass as the foundation with Y2K chrome and iridescent accents on specific hero elements only.
