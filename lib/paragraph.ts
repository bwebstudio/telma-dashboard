/**
 * THE PARAGRAPH RULE
 *
 * Where a line of Telma's text starts and where it ends. One rule, two very
 * different surfaces: the hero's letter field samples it per glyph to decide
 * whether a letter belongs at a point, and the article covers project it into
 * perspective to draw a page. Same function, same seed, so a cover is a crop
 * of the same text the hero is setting live rather than something drawn to
 * look similar.
 *
 * It lives here and not inside the field's engine because the engine is an
 * experiment and this is not: if the WebGL hero is ever dropped, the covers
 * still have to keep making paragraphs.
 *
 * What makes it read as writing and not as a loading skeleton: lines end at
 * different places, one in seven stops well short, and the line after a short
 * one starts indented. Take those three away and grey stacked bars mean
 * "loading" to every person on the internet.
 */

/** Lines in a full sheet. The field's density is tuned around this count. */
export const PARA_LINES = 22

/** How much of a line's height the letters fill. The rest is the gap, and the
 *  gap is the whole point: it is what makes this text and not weather. */
export const PARA_INK = 0.46

/** Deterministic 0..1 for line `i`, so a line keeps its length across rebuilds. */
export function lineRand(i: number, salt: number) {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Where line `i` ends, as a fraction of the measure. Most run nearly the full
 *  width; a seventh stop early, which is what ends a sentence. */
export function lineRight(i: number) {
  const stops = lineRand(i, 2) < 0.15
  return stops ? 0.22 + 0.42 * lineRand(i, 1) : 0.8 + 0.19 * lineRand(i, 1)
}

/** Where line `i` starts. Only the line after a short one is indented, because
 *  a short line ended a paragraph. */
export function lineIndent(i: number) {
  return lineRand(i - 1, 2) < 0.15 ? 0.03 + 0.02 * lineRand(i, 3) : 0
}

/**
 * THE ALPHABET.
 *
 * Weighted by how often each character turns up in written Portuguese, so the
 * texture of a cloud is the texture of the language rather than an even
 * alphabet soup. No digits: a call is words.
 *
 * It lives here with the line rule because the hero's field and the mark's
 * settle are the same cloud seen at two sizes, and an alphabet that drifted
 * between them would be the one difference nobody could name but everybody
 * would feel.
 */
export const GLYPH_WEIGHTS: [string, number][] = [
  ['a', 10], ['e', 10], ['o', 8], ['r', 6], ['s', 6], ['m', 5], ['t', 5],
  ['n', 4], ['i', 4], ['d', 3], ['u', 3], ['c', 3], ['l', 2], ['p', 2],
  ['ã', 3], ['ç', 3], ['õ', 1], ['é', 1], ['á', 1], ['ê', 1], ['ó', 1],
  ['?', 2], ['.', 3], [',', 3],
]

/** The same set, expanded so a uniform random index lands on the weights. */
export const GLYPH_BAG = GLYPH_WEIGHTS.flatMap(([ch, n]) => Array<string>(n).fill(ch))
