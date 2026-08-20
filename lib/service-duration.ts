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
  custom_services?: string | null
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

/** Everything this clinic offers: what it ticked, and what it typed. */
export function allServices(clinic: DurationSource): string[] {
  return [
    ...(clinic.services ?? []),
    ...String(clinic.custom_services ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  ]
}

/**
 * Which service the caller meant.
 *
 * Matched against everything the clinic offers, not against the services it
 * happens to have given a length to. Tying it to the lengths was the mistake:
 * lengths are optional, most clinics set none, and a clinic that had set one
 * could only ever match that one. The panel colours a booking by this, so every
 * chip in the week came out the same shade of nothing.
 *
 * Answers only when exactly one service fits. A clinic with two things called
 * "Consulta de valoración" gets neither rather than the wrong one.
 */
export function matchService(services: string[], said: string | null): string | null {
  if (!said || !services.length) return null
  const heard = flatten(said)
  if (!heard) return null

  if (services.includes(said)) return said

  const only = (ids: string[]): string | null => (ids.length === 1 ? ids[0] : null)

  const labelled = services.filter((id) =>
    [serviceLabel(id, 'pt'), serviceLabel(id, 'es')]
      .map(flatten)
      .some((l) => l && (l === heard || heard.includes(l) || l.includes(heard)))
  )
  const byLabel = only(labelled)
  if (byLabel) return byLabel

  // Callers say "el láser", not "depilación láser". Short words are excluded
  // because "de" and "una" would match everything there is.
  return only(
    services.filter((id) =>
      [serviceLabel(id, 'pt'), serviceLabel(id, 'es')]
        .flatMap((l) => flatten(l).split(' '))
        .filter((w) => w.length >= 5)
        .some((w) => heard.includes(w))
    )
  )
}

export function resolveDuration(clinic: DurationSource, said: string | null): ResolvedDuration {
  const fallback = clinic.appointment_duration_minutes ?? clinic.slot_minutes ?? 30
  const durations = clinic.service_durations ?? {}

  const id = matchService(allServices(clinic), said)
  // A service the clinic named but gave no length to takes the usual one, which
  // is the same answer as before and the safe direction to be wrong in.
  return { minutes: (id && durations[id]) || fallback, service_id: id }
}

/**
 * The lengths worth storing: the ones belonging to services actually offered.
 *
 * A clinic that ticks laser, sets it to forty-five minutes and then unticks it
 * would otherwise leave the forty-five behind for ever, invisible in the record
 * and waiting to reappear the day somebody ticks laser again.
 */
export function keepChosen(
  values: Record<string, number> | null | undefined,
  services: string[] | null | undefined,
  /** The free-text list, one service per line. Those carry lengths and prices
   *  too, keyed by the line itself, and dropping them here would quietly wipe
   *  the price of everything the catalogue has never heard of. */
  customServices?: string | null
): Record<string, number> {
  const offered = new Set(services ?? [])
  for (const line of (customServices ?? '').split('\n')) {
    const clean = line.trim()
    if (clean) offered.add(clean)
  }
  return Object.fromEntries(Object.entries(values ?? {}).filter(([id]) => offered.has(id)))
}

/**
 * Which diary the caller meant, from the name they said.
 *
 * Same shape and same caution as the service matching above: an exact name, a
 * name contained in what was said, and then a distinctive word, answering only
 * when exactly one diary fits. A clinic with two Marías gets neither rather
 * than the wrong one, and the caller is asked which.
 *
 * Null means "whoever is free", which is the right reading of a caller who
 * never named anybody and the only safe reading of one who named two people.
 */
export function resolveResource(
  resources: Array<{ id: string; name: string }>,
  said: string | null
): string | null {
  if (!said || resources.length < 2) return null
  const heard = flatten(said)
  if (!heard) return null

  const exact = resources.filter((r) => {
    const name = flatten(r.name)
    return name && (name === heard || heard.includes(name) || name.includes(heard))
  })
  if (exact.length === 1) return exact[0].id

  const worded = resources.filter((r) =>
    flatten(r.name)
      .split(' ')
      .filter((w) => w.length >= 4)
      .some((w) => heard.includes(w))
  )
  return worded.length === 1 ? worded[0].id : null
}

/**
 * The reason as the clinic's own service, or nothing.
 *
 * The base tells Telma to write the service rather than the patient's words,
 * and a rule is a request. This is the guarantee: whatever arrives is matched
 * against what the clinic offers, and only the clinic's own label is stored.
 *
 * When nothing matches, nothing is stored. That is the safe direction twice
 * over: it cannot be a description of somebody's symptoms sitting in a database
 * for months, and it is visible — an appointment with no reason is a question
 * the clinic asks, where "consulta general" for somebody who needed a speech
 * therapist is a booking that looks fine until they arrive.
 */
export function canonicalReason(clinic: DurationSource, said: string | null): string | null {
  const id = matchService(allServices(clinic), said)
  if (!id) return null
  // The catalogue's own wording, in the clinic's language, never the caller's.
  return serviceLabel(id, 'es') === id ? id : serviceLabel(id, 'es')
}
