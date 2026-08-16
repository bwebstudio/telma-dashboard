/**
 * Fills `{name}` holes in a dictionary string.
 *
 * Dictionary entries are strings and never functions: the whole dictionary is
 * handed across the server/client boundary, React serialises it there, and a
 * function does not survive the crossing. The page throws while rendering, on
 * the server, and the browser is shown a digest with no message in it.
 *
 * That happened once, cost the hours page, and was written up in a test that
 * walks all three dictionaries. This is the other half: somewhere for the
 * values to go, so nobody reaches for a function because there was nowhere.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole
  )
}
