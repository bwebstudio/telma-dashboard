import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PatientRecord } from '@/components/clinic/PatientRecord'
import type { Appointment, Call, Patient, PatientRecall } from '@/lib/types'

/**
 * One person, as this clinic knows them.
 *
 * Three queries and no cleverness: the record, every booking pointing at it, and
 * every reminder. A record is opened one at a time by somebody with a telephone
 * in their hand, so the cost that matters is the first paint and not the total.
 */

export const dynamic = 'force-dynamic'

export default async function PacientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { locale, dict } = await getDict()
  const { clinic, clinicId, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  // Scoped by clinic as well as by id. A record from another clinic is a 404 and
  // not a permission error: the difference between "you may not see this" and
  // "there is nothing here" is itself something about somebody's patient.
  const { data } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  const patient = data as Patient | null
  if (!patient) notFound()

  // ── AND THE CALLS ─────────────────────────────────────────────────────────
  // Matched on the last nine digits of the number, at read time, rather than by
  // a column joining the call to the record. The column would be tidier and it
  // would undo the thing it is tidying: `calls.from_phone` is cleared at ninety
  // days precisely so that an old call identifies nobody, and a patient_id
  // pointing at it afterwards would put the person straight back.
  //
  // So old calls fall off this record as their numbers are cleared, which is
  // the retention working rather than the join failing, and the screen says so.
  const digits = patient.phone.replace(/\D/g, '').slice(-9)
  // Every number this person has rung from, the main one and any kept by a
  // merge. A merged record whose calls only matched the first number would look
  // emptier after the merge than before it.
  const allDigits = [digits, ...(patient.other_digits ?? [])].filter((d) => d.length === 9)

  const [{ data: appts }, { data: recalls }, { data: calls }] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('patient_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(50),
    supabase
      .from('patient_recalls')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('patient_id', id)
      .order('due_on', { ascending: false })
      .limit(30),
    allDigits.length
      ? supabase
          .from('calls')
          .select('*')
          .eq('clinic_id', clinicId)
          .or(allDigits.map((d) => `from_phone.ilike.%${d}`).join(','))
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
  ])

  // ── IS THERE A SECOND RECORD FOR THIS PERSON? ─────────────────────────────
  // The error 0049 leaves standing: one person, two telephones, two records.
  // Nothing in the data can close it, so this only puts the candidates next to
  // each other and a person decides. Matched on the tax number when the clinic
  // has typed one, and otherwise on the name, which is weaker and is why the
  // screen says "may be" rather than "is".
  const sameAs: string[] = []
  if (patient.tax_key) sameAs.push(`tax_key.eq.${patient.tax_key}`)
  if (patient.name_key) sameAs.push(`name_key.eq.${patient.name_key}`)
  const { data: twins } = sameAs.length
    ? await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .neq('id', id)
        .or(sameAs.join(','))
        .order('last_seen_at', { ascending: false })
        .limit(5)
    : { data: [] }

  return (
    <>
      <Link
        href="/pacientes"
        className="mb-4 inline-block text-base text-ink-soft hover:text-ink"
      >
        &larr; {dict.pacientes.back}
      </Link>
      <PatientRecord
        patient={patient}
        appointments={(appts ?? []) as Appointment[]}
        recalls={(recalls ?? []) as PatientRecall[]}
        calls={(calls ?? []) as Call[]}
        twins={(twins ?? []) as Patient[]}
        clinic={{
          name: clinic?.name ?? '',
          language: clinic?.language ?? locale,
          assigned_phone: clinic?.assigned_phone ?? null,
        }}
        dict={dict}
        locale={locale}
        readOnly={readOnly}
      />
    </>
  )
}
