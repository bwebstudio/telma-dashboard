import type { Config } from 'tailwindcss'

// Same palette and type system as the Telma landing page, for total coherence.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F6F2EA',
        'paper-2': '#EFE9DC',
        'paper-3': '#E7E0D0',
        ink: '#14110E',
        'ink-soft': '#4A433B',
        'ink-mute': '#6F6759',
        accent: '#A94A27',
        'accent-dark': '#8C3D1E',
        'accent-light': '#E38A5C',
        pine: '#1B3A2E',
        'pine-soft': '#264C3D',
        sage: '#9FB6A6',
        line: '#DCD3C1',
        'line-strong': '#C6BBA4',
        // Status colours, kept warm and muted, never neon dashboard tones.
        ok: '#1F6B4A',
        'ok-soft': '#E4EFE7',
        warn: '#9A6314',
        'warn-soft': '#F3E9D3',
        danger: '#9E2B25',
        'danger-soft': '#F1DFDC',
      },
      fontFamily: {
        serif: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.55' }],
      },
      letterSpacing: {
        label: '0.18em',
      },
      maxWidth: {
        app: '80rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
