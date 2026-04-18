/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens, backed by CSS variables in index.css.
        // To swap themes later, override the variables — Tailwind utilities follow.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-hover': 'rgb(var(--surface-hover) / <alpha-value>)',
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        'text-1': 'rgb(var(--text-1) / <alpha-value>)',
        'text-2': 'rgb(var(--text-2) / <alpha-value>)',
        'text-3': 'rgb(var(--text-3) / <alpha-value>)',
        violet: {
          DEFAULT: 'rgb(var(--violet) / <alpha-value>)',
          glow: 'rgb(var(--violet-glow) / <alpha-value>)',
        },
        mint: {
          DEFAULT: 'rgb(var(--mint) / <alpha-value>)',
          glow: 'rgb(var(--mint-glow) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--amber) / <alpha-value>)',
          glow: 'rgb(var(--amber-glow) / <alpha-value>)',
        },
        rose: {
          DEFAULT: 'rgb(var(--rose) / <alpha-value>)',
          glow: 'rgb(var(--rose-glow) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'serif'],
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glass-sm': '0 4px 16px -6px rgba(0,0,0,0.3), inset 0 1px 0 0 rgba(255,255,255,0.05)',
        'glass-md': '0 8px 32px -12px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.06)',
        'glass-lg': '0 20px 60px -20px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.08)',
        'glow-violet': '0 0 40px -10px rgba(167,139,250,0.55)',
        'glow-mint': '0 0 28px -6px rgba(94,234,212,0.55)',
        'glow-amber': '0 0 28px -6px rgba(251,191,36,0.55)',
        'btn-violet': '0 2px 10px -2px rgba(124,58,237,0.5), inset 0 1px 0 0 rgba(255,255,255,0.2)',
        'btn-violet-hover': '0 6px 22px -4px rgba(124,58,237,0.7), inset 0 1px 0 0 rgba(255,255,255,0.28)',
      },
      keyframes: {
        breathe: {
          '0%':   { transform: 'translate3d(0,0,0) scale(1)' },
          '100%': { transform: 'translate3d(2%,-1%,0) scale(1.06)' },
        },
        rise: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        breathe: 'breathe 32s ease-in-out infinite alternate',
        rise: 'rise 520ms cubic-bezier(0.22,1,0.36,1) both',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
}
