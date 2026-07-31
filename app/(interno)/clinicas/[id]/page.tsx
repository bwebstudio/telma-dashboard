import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle, Badge } from '@/components/ui'
import { CallItem } from '@/components/CallItem'
import { formatDate, formatTime, currentMonthKey } from '@/lib/format'
import type {
  Clinic,
  AvailabilitySlot,
  Call,
  Appointment,
  Usage,
  ClinicStatus,
  AppointmentStatus,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

const clinicTone: Record<ClinicStatus, 'ok' | 'warn' | 'danger'> = {
  ativa: 'ok',
  pausada: 'warn',
  cancelada: 'danger',
}
const apptTone: Record<AppointmentStatus, 'pending' | 'ok' | 'danger'> = {
  pendente: 'pending',
  confirmada: 'ok',
  copiada: 'ok',
  rejeitada: 'danger',
}

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { locale, dict } = await getDict()
  const t = dict.interno
  const supabase = await createClient()

  const { data: clinicData } = await supabase.from('clinics').select('*').eq('id', id).maybeSingle()
  const clinic = clinicData as Clinic | null
  if (!clinic) notFound()

  const [slotsRes, callsRes, apptsRes, usageRes] = await Promise.all([
    supabase.from('availability_slots').select('*').eq('clinic_id', id),
    supabase.from('calls').select('*').eq('clinic_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('appointments').select('*').eq('clinic_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('usage').select('*').eq('clinic_id', id).eq('month', currentMonthKey()).maybeSingle(),
  ])

  const slots = (slotsRes.data ?? []) as AvailabilitySlot[]
  const calls = (callsRes.data ?? []) as Call[]
  const appts = (apptsRes.data ?? []) as Appointment[]
  const usage = usageRes.data as Usage | null

  const byWeekday = new Map<number, string[]>()
  for (const s of slots) {
    const arr = byWeekday.get(s.weekday) ?? []
    arr.push(s.start_time.slice(0, 5))
    byWeekday.set(s.weekday, arr)
  }
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]

  return (
    <>
      <Link href="/clinicas" className="mb-4 inline-block text-base text-ink-mute hover:text-brand-accent">
        ← {dict.internoNav.clinicas}
      </Link>
      <PageHeader
        title={clinic.name}
        action={<Badge tone={clinicTone[clinic.status]}>{dict.status.clinic[clinic.status]}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle>{t.fichaData}</SectionTitle>
          <dl className="flex flex-col gap-2.5">
            <Row label={dict.conta.plan} value={dict.plans[clinic.plan]} />
            <Row label="Limite" value={`${usage?.calls_count ?? 0} / ${clinic.call_limit}`} />
            <Row label={dict.common.phone} value={clinic.phone} />
            <Row label="Email" value={clinic.contact_email} />
            <Row label={dict.interno.fieldAddress} value={clinic.address} />
            <Row label={dict.conta.addon} value={clinic.addon_whatsapp ? dict.conta.addonOn : dict.conta.addonOff} />
          </dl>
        </section>

        <section className="card p-6">
          <SectionTitle>{t.fichaTechnical}</SectionTitle>
          <dl className="flex flex-col gap-2.5">
            <Row label={t.assignedPhone} value={clinic.assigned_phone} mono />
            <Row label={t.agentId} value={clinic.voice_agent_id} mono />
            <Row label={t.voiceName} value={clinic.voice_name} />
          </dl>
        </section>

        <section className="card p-6 lg:col-span-2">
          <SectionTitle>{t.fichaSlots}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {weekdayOrder.map((wd) => {
              const hours = byWeekday.get(wd)
              if (!hours || hours.length === 0) return null
              return (
                <div key={wd} className="flex gap-3 border-b border-line py-2">
                  <span className="w-24 shrink-0 font-medium text-ink">{dict.weekdays[wd]}</span>
                  <span className="text-ink-soft">{hours.sort().join(', ')}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="card p-6">
          <SectionTitle>{t.fichaAppointments}</SectionTitle>
          {appts.length === 0 ? (
            <p className="text-base text-ink-mute">{dict.common.none}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {appts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{a.patient_name}</span>
                    <span className="text-sm text-ink-mute">
                      {formatDate(a.scheduled_at, locale)}, {formatTime(a.scheduled_at, locale)}
                    </span>
                  </span>
                  <Badge tone={apptTone[a.status]}>{dict.status.appointment[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <SectionTitle>{t.fichaCalls}</SectionTitle>
          {calls.length === 0 ? (
            <p className="text-base text-ink-mute">{dict.common.none}</p>
          ) : (
            <div className="-mx-2">
              {calls.map((call) => (
                <div key={call.id} className="px-2">
                  <CallItem call={call} dict={dict} locale={locale} withDate />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className={`text-right text-ink ${mono ? 'font-mono text-sm' : ''}`}>{value || '·'}</dd>
    </div>
  )
}
