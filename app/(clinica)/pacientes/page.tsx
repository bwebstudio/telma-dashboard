import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorState, Badge } from '@/components/ui'
import { RecallQueue } from '@/components/clinic/RecallQueue'
import { NewPatient } from '@/components/clinic/NewPatient'
import { formatDate } from '@/lib/format'
import { fill } from '@/lib/fill'
import type { Patient, PatientRecall } from '@/lib/types'

/**
 * Everyone this clinic has ever taken a booking for, and what is going out.
 *
 * ── WHY THE REMINDERS ARE ON THIS SCREEN AND NOT THEIR OWN ──────────────────
 * A reminder is about a person. Put the queue on a screen of its own and there
 * are two places to cancel one, which is the mistake the calendar words made
 * before: the same decision in two rooms, and whichever one you are standing in
 * is the wrong one.
 *
 * So the list shows the only thing a record cannot: what is leaving in the next
 * fortnight, and what failed to leave. Everything else about one person happens
 * on that person's record.
 *
 * ── AND WHY THERE IS NO PAGINATION ──────────────────────────────────────────
 * Sixty, most recently heard from first, and a search box. The question this
 * screen answers is "what do we know about the person in front of me", which is
 * a search, never a walk through page eleven of an alphabet. The count of what
 * is not shown is stated rather than hidden, for the same reason the bookings
 * queue states its own.
 */

export const dynamic = 'force-dynamic'

const SHOWN = 60
/** How far ahead the queue looks. Long enough to notice a mistake in the
 *  intervals before it reaches anybody, short enough to be a list and not an
 *  archive of the next two years. */
const AHEAD_DAYS = 14

interface QueueRow extends PatientRecall {
  patients: { id: string; name: string } | null
}

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const term = (q ?? '').trim()
  const { locale, dict } = await getDict()
  const { clinic, clinicId, readOnly } = await requireClinicContext()
  const supabase = await createClient()
  const t = dict.pacientes

  const horizon = new Date(Date.now() + AHEAD_DAYS * 86400_000).toISOString().slice(0, 10)

  let list = supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('last_seen_at', { ascending: false })
    .limit(SHOWN)
  if (term) {
    // The name as typed, or the digits of the number. A receptionist holding a
    // telephone has the number and not the spelling.
    const digits = term.replace(/\D/g, '')
    // Nine digits can be a number a merge kept, so those are looked for in both
    // places. Fewer than nine is a fragment somebody is typing, and a fragment
    // only matches the main number.
    list =
      digits.length >= 9
        ? list.or(`phone.ilike.%${digits.slice(-9)}%,other_digits.cs.{${digits.slice(-9)}}`)
        : digits.length >= 3
          ? list.ilike('phone', `%${digits}%`)
          : list.ilike('name', `%${term}%`)
  }

  const [{ data, error }, { count: total }, { data: queue }] = await Promise.all([
    list,
    supabase
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId),
    supabase
      .from('patient_recalls')
      .select('*, patients(id, name)')
      .eq('clinic_id', clinicId)
      .in('state', ['agendado', 'falhou'])
      .lte('due_on', horizon)
      .order('due_on', { ascending: true })
      .limit(40),
  ])

  const patients = (data ?? []) as Patient[]
  const rows = (queue ?? []) as unknown as QueueRow[]
  const hidden = Math.max(0, (total ?? 0) - patients.length)

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.pacientes} title={t.title} subtitle={t.lead} />

      <RecallQueue
        rows={rows.map((r) => ({
          id: r.id,
          patientId: r.patients?.id ?? r.patient_id,
          patientName: r.patients?.name ?? '',
          dueOn: r.due_on,
          state: r.state,
          kind: r.kind,
          note: r.note ?? null,
          error: r.error ?? null,
        }))}
        dict={dict}
        locale={locale}
        readOnly={readOnly}
      />

      {/* Finding somebody and opening a record for somebody are the same job at
          the same moment: the person is in front of you and either they are on
          the list or they are not. One row, not two places. */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form action="/pacientes" className="flex flex-1 flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder={t.search}
            aria-label={t.search}
            className="field-input max-w-sm flex-1"
          />
          <button type="submit" className="btn-secondary">
            {t.searchGo}
          </button>
        </form>
        {!readOnly && <NewPatient dict={dict} />}
      </div>

      {error ? (
        <ErrorState title={dict.common.errorTitle} message={dict.common.errorGeneric} />
      ) : patients.length === 0 ? (
        <EmptyState>{term ? t.none : t.empty}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {patients.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pacientes/${p.id}`}
                  className="card flex flex-wrap items-center justify-between gap-3 p-4 transition-colors duration-fast hover:border-ink/20"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-semibold text-ink">{p.name}</span>
                    <span className="block text-base text-ink-soft">{p.phone}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {p.reminders_opt_out_at && <Badge tone="neutral">{t.optedOut}</Badge>}
                    <span className="text-sm text-ink-mute">
                      {formatDate(p.last_seen_at, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* What is not on screen, said rather than hidden. */}
          {!term && hidden > 0 && (
            <p className="mt-6 text-base text-ink-mute">{fill(t.more, { n: hidden })}</p>
          )}
        </>
      )}
    </>
  )
}
