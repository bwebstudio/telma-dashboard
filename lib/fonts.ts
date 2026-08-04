import localFont from 'next/font/local'

/**
 * ONE FAMILY: SUISSE INT'L.
 *
 * A neutral Swiss grotesque in four static weights. The panel ran a variable
 * DM Sans before, whose 550 axis stop carried the display hierarchy; Suisse has
 * no axis, so that job moves to 600 (Semibold), which on this face holds at
 * 40px without shouting. See `.h-display` in globals.css.
 *
 * Subset to Latin, Latin-1 and Latin Extended-A — the Portuguese and Spanish
 * accents — plus the punctuation and arrows the interface draws with text:
 * 146KB for four weights instead of 830KB of unsubset OTF.
 *
 * These files are the TEST cut of the family, from FFT_Romina. Before this is
 * in front of a paying clinic the licensed web fonts have to replace them:
 * same names, same weights, nothing else changes.
 */
export const sans = localFont({
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  src: [
    { path: '../public/fonts/SuisseIntl-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/SuisseIntl-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/SuisseIntl-Semibold.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/SuisseIntl-Bold.woff2', weight: '700', style: 'normal' },
  ],
})
