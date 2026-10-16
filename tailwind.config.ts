import type { Config } from 'tailwindcss'

/**
 * The same thin mapping the landing uses: nothing here holds a literal colour,
 * radius or duration. Every value comes from a custom property in
 * app/globals.css, so the panel and the site are one design system with one
 * place to change it.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
          // The mid grey — the one that may be read as text on a light
          // surface, at 7.81:1. Never use it for a label on the dark blocks.
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          wash: 'rgb(var(--brand-wash) / <alpha-value>)',
          'wash-strong': 'rgb(var(--brand-wash-strong) / <alpha-value>)',
        },
        // The clinic's colour. These resolve through --accent, which the
        // [data-accent] blocks in globals.css repoint per clinic, so a
        // component written against `bg-accent-wash` follows the clinic
        // without naming a hue. Prefer these over naming a ramp directly.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          wash: 'rgb(var(--accent-wash) / <alpha-value>)',
        },
        // The four ramps themselves, for the handful of places that mean one
        // specific hue and not "whatever this clinic picked" — a chart series,
        // a legend. Four steps, and they mean the same thing in every hue: 400
        // is the saturated one for a border or a small solid, the base is a
        // ground you can read ink on, 200 is a hover, 100 is a wash. White
        // never goes on any of them.
        macaw: {
          DEFAULT: 'rgb(var(--macaw) / <alpha-value>)',
          400: 'rgb(var(--macaw-400) / <alpha-value>)',
          200: 'rgb(var(--macaw-200) / <alpha-value>)',
          100: 'rgb(var(--macaw-100) / <alpha-value>)',
        },
        purple: {
          DEFAULT: 'rgb(var(--purple) / <alpha-value>)',
          400: 'rgb(var(--purple-400) / <alpha-value>)',
          200: 'rgb(var(--purple-200) / <alpha-value>)',
          100: 'rgb(var(--purple-100) / <alpha-value>)',
        },
        blue: {
          DEFAULT: 'rgb(var(--blue) / <alpha-value>)',
          400: 'rgb(var(--blue-400) / <alpha-value>)',
          200: 'rgb(var(--blue-200) / <alpha-value>)',
          100: 'rgb(var(--blue-100) / <alpha-value>)',
        },
        red: {
          DEFAULT: 'rgb(var(--red) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
          200: 'rgb(var(--red-200) / <alpha-value>)',
          100: 'rgb(var(--red-100) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          mute: 'rgb(var(--ink-mute) / <alpha-value>)',
        },
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        dark: {
          DEFAULT: 'rgb(var(--dark) / <alpha-value>)',
          soft: 'rgb(var(--dark-soft) / <alpha-value>)',
          line: 'rgb(var(--dark-line) / <alpha-value>)',
        },
        // Panel only. A landing page has no overdue rows.
        ok: {
          DEFAULT: 'rgb(var(--ok) / <alpha-value>)',
          soft: 'rgb(var(--ok-soft) / <alpha-value>)',
        },
        warn: {
          DEFAULT: 'rgb(var(--warn) / <alpha-value>)',
          soft: 'rgb(var(--warn-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          soft: 'rgb(var(--danger-soft) / <alpha-value>)',
        },
      },
      fontWeight: {
        // Suisse has four static weights and no axis, so this is Medium. It is
        // the weight that lifts one figure out of a row of labels — a time, a
        // count — without turning it into a heading.
        mid: '500',
      },
      fontFamily: {
        // Matter reads to the clinic; the mono is the panel talking about
        // itself. Two faces, the same pair the site uses.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        input: 'var(--radius-input)',
        card: 'var(--radius-card)',
        hero: 'var(--radius-hero)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        brand: 'var(--shadow-brand)',
      },
      transitionTimingFunction: {
        calm: 'var(--ease)',
      },
      transitionDuration: {
        fast: '250ms',
        DEFAULT: '400ms',
        slow: '600ms',
      },
      maxWidth: {
        app: '82.5rem',
        prose: '36rem',
        lead: '42rem',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        26: '6.5rem',
        30: '7.5rem',
      },
      letterSpacing: {
        label: '0.14em',
        display: '-0.02em',
        tight: '-0.014em',
        snug: '-0.008em',
      },
      fontSize: {
        label: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.14em' }],
        // Quieter than the landing's scale. This is a tool somebody opens forty
        // times a day between two visits, not a page that has to sell.
        h3: ['clamp(1.125rem, 1.05rem + 0.4vw, 1.25rem)', { lineHeight: '1.4' }],
        h2: ['clamp(1.375rem, 1.2rem + 0.8vw, 1.75rem)', { lineHeight: '1.2' }],
        h1: ['clamp(1.625rem, 1.4rem + 1.1vw, 2.25rem)', { lineHeight: '1.15' }],
      },
    },
  },
  plugins: [],
}

export default config
