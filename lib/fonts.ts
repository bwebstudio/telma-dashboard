import localFont from 'next/font/local'

/**
 * ONE FAMILY: DM SANS. The same file, at the same settings, as the landing.
 *
 * The panel used to run Clash Display for headings over General Sans for body —
 * six files and two personalities. The site moved to a single variable family
 * whose optical axis does the work the serif used to do, and a panel that looks
 * like a different product from the page that sold it is a tell nobody can
 * unsee. So: same family, same weights, same tracking.
 *
 * 550 is the weight the whole hierarchy turns on, and it is only reachable
 * because the family is variable. See `.h-display` in globals.css.
 */
export const sans = localFont({
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  src: [
    {
      path: '../public/fonts/DMSans-Variable-latin.woff2',
      weight: '300 700',
      style: 'normal',
    },
  ],
})
