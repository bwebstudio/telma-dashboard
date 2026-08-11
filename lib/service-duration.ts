import { serviceLabel } from './onboarding/catalog.ts'

/**
 * How long to leave in the diary for what the caller just asked for.
 *
 * The awkward part is that the two ends do not speak the same language. The
 * clinic configures durations against service ids (`estet_laser`), and the
 * caller says "depilación láser", or "el láser", or "lo de las piernas". Telma
 * is told to write the reason down in the caller's own words and that rule is
 * worth keeping: it is what makes the note in the panel useful.
 *
 * So the matching happens here rather than being pushed onto the model. Asking
 * Telma to pick a service id mid-call would mean reading her a list of internal
 * identifiers, and she would guess wrong on exactly the treatments that are
 * unusual, which are the ones whose duration differs from the default.
 *
 * Deliberately not clever. An exact id, then a label in either language, then a
 * label contained in what was said. Anything else falls back to the clinic's
 * default length, which is the safe direction to be wrong in: a slot of the
 * usual size, offered, rather than no slot at all.
 */

export interface DurationSource {
  services?: string[] | null
  service_durations?: Record<string, number> | null
  appointment_duration_minutes?: number | null
  slot_minutes?: number | null
}

export interface ResolvedDuration {
  minutes: number
  /** The service it matched, for the panel and for working out what went wrong. */
  service_id: string | null
}

/** Lowercase, unaccented, punctuation gone. "Depilación Láser" and
 *  "depilacion laser" are the same thing said by two different microphones. */
function flatten(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveDuration(clinic: DurationSource, said: string | null): ResolvedDuration {
  const fallback =
    clinic.appointment_duration_minutes ?? clinic.slot_minutes ?? 30
  const durations = clinic.service_durations ?? {}
  const configured = Object.keys(durations)
  if (!said || !configured.length) return { minutes: fallback, service_id: null }

  const heard = flatten(said)
  if (!heard) return { minutes: fallback, service_id: null }

  // The id itself, in case a caller of this endpoint already knows it.
  if (durations[said] != null) return { minutes: durations[said], service_id: said }

  // Both passes collect every service that fits and only answer when exactly one
  // does. Returning the first match instead looks identical almost always and is
  // wrong in the one case that matters: the catalogue deliberately keeps
  // `dent_consulta` and `est_consulta` apart, and both read "Consulta de
  // valoración", so a clinic offering the two would have every valuation booked
  // at whichever length happened to be listed first, silently and for ever.
  const only = (ids: string[]): ResolvedDuration | null =>
    ids.length === 1 ? { minutes: durations[ids[0]], service_id: ids[0] } : null

  const labelled = configured.filter((id) =>
    [serviceLabel(id, 'pt'), serviceLabel(id, 'es')]
      .map(flatten)
      .some((l) => l && (l === heard || heard.includes(l) || l.includes(heard)))
  )
  const byLabel = only(labelled)
  if (byLabel) return byLabel

  // Last resort: a distinctive word from the label, inside what was said.
  // Callers say "el láser", not "depilación láser". Short words are excluded
  // because "de" and "una" would match everything there is.
  const worded = configured.filter((id) =>
    [serviceLabel(id, 'pt'), serviceLabel(id, 'es')]
      .flatMap((l) => flatten(l).split(' '))
      .filter((w) => w.length >= 5)
      .some((w) => heard.includes(w))
  )
  const byWord = only(worded)
  if (byWord) return byWord

  return { minutes: fallback, service_id: null }
}
