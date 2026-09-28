import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PatientRecord } from '@/components/clinic/PatientRecord'
import type { Appointment, Patient, PatientRecall } from '@/lib/types'

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

  const [{ data: appts }, { data: recalls }] = await Promise.all([
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
  ])

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
