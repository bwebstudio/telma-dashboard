import localFont from 'next/font/local'

/**
 * ONE FAMILY: MATTER.
 *
 * The same face the site is set in, so a clinic that read the page and then
 * logged in is looking at one product rather than two. It replaces Suisse
 * Intl, which was the register the brand was after before the brand existed.
 *
 * THREE WEIGHTS, NOT FOUR. Matter's Bold is not loaded and `.h-display` runs
 * at 600. Next preloads every cut declared here, so a weight nothing uses is
 * 40KB the receptionist pays for at first paint and never sees — and the panel
 * has no headline big enough to need more than Semibold. The 700 that the old
 * four-weight build offered was never reached by anything in globals.css.
 *
 * LATIN EXTENDED, WHERE THE SITE IS LATIN ONLY. That difference is deliberate
 * and it is the only place the two builds diverge. The site renders copy we
 * wrote; this panel renders names that clinics type, and a clinic in Lisbon
 * books Kowalski and Nováková in the same morning. The 219-glyph cut the site
 * ships would drop the diacritics out of both. 491 glyphs, 40KB a cut.
 *
 * It still does not cover Cyrillic — Matter has none to subset, so a Ukrainian
 * name falls through to the stack below rather than being drawn wrong. That is
 * the right failure and it is why the fallback list is explicit instead of a
 * bare `sans-serif`: the name stays legible, in a face that is merely not ours.
 *
 * TRIAL FILES. Built from Displaay's trial cuts, licensed for evaluation. The
 * licensed release delivers the same names and weights; rebuild the three
 * .woff2 from those and nothing else here changes. See public/fonts/README.txt.
 */
/**
 * AND THE MONO, FOR WHAT THE SYSTEM SAYS ABOUT ITSELF.
 *
 * Basis Grotesque Mono, the same cut the site loads, on the same division of
 * labour: Matter is what the clinic reads, the mono is what the panel says
 * about itself — the small capital labels over a section, a status, a count.
 * It is the half of the pairing the panel was missing, and without it those
 * labels were just Matter made small, which is a size and not a voice.
 *
 * One weight, Regular. Nothing here needs a bold machine label, and the
 * uppercase sizes it is used at would thicken into a smudge.
 *
 * Latin only, unlike the sans above: this face never renders a patient's name,
 * only words we wrote, so the 219-glyph cut is the whole of what it can meet.
 */
export const mono = localFont({
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  src: [{ path: '../public/fonts/BasisGrotesqueMonoPro-Regular-latin.woff2', weight: '400', style: 'normal' }],
})

export const sans = localFont({
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
  src: [
    { path: '../public/fonts/Matter-Regular-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Matter-Medium-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Matter-SemiBold-latin-ext.woff2', weight: '600', style: 'normal' },
  ],
})
