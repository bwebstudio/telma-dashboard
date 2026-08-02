import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  fetchActivities,
  fetchContacts,
  fetchProspect,
  fetchReps,
  requireCrmSession,
} from '@/lib/crm/data'
import { dateTimeIn, smartStamp, tzFor } from '@/lib/crm/time'
import { telHref, waHref } from '@/lib/crm/phone'
import { assignProspect, takeProspect, requestConversion } from '@/lib/actions/crm'
import { LogButton } from '@/components/crm/LogButton'
import { crmStrings } from '@/lib/crm/strings'
import { CrmLive } from '@/components/crm/CrmLive'
import { ContactForm } from '@/components/crm/ContactForm'
import { Badge } from '@/components/ui'
import { IconPhone, IconWhatsApp, IconClock } from '@/components/icons'
import type { CrmStage } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

const stageTone: Record<CrmStage, 'neutral' | 'pending' | 'ok' | 'warn' | 'danger' | 'info'> = {
  new: 'neutral',
  attempting: 'neutral',
  contacted: 'pending',
  interested: 'pending',
  meeting: 'info',
  won: 'ok',
  lost: 'danger',
}

// The clinic record. The activity thread is the important part of this page:
// it is the same shape as the WhatsApp messages the reps already write, so
// nobody has to learn a new way of thinking about a clinic.
export default async function ProspetoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user, isAdmin, dict, locale } = await requireCrmSession()
  const t = dict.crm
  const supabase = await createClient()

  const prospect = await fetchProspect(supabase, id)
  if (!prospect) notFound()

  const [contacts, activities, reps] = await Promise.all([
    fetchContacts(supabase, id),
    fetchActivities(supabase, id),
    fetchReps(supabase),
  ])

  const repName = new Map(reps.map((r) => [r.id, r.full_name]))
  const tz = tzFor(prospect.country)
  const now = new Date()
  const tel = telHref(prospect.phone, prospect.country)
  const wa = waHref(prospect.phone, prospect.country)
  const overdue = Boolean(prospect.next_action_at && new Date(prospect.next_action_at) < now)
  const isMine = prospect.rep_id === user.id
  const isUnassigned = prospect.rep_id === null

  return (
    <div className="pb-24 md:pb-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/crm/hoje" className="inline-flex min-h-[2.75rem] items-center text-base text-ink-mute hover:text-brand-accent">
          ← {dict.common.back}
        </Link>
        <CrmLive
          channel={`crm-prospect-${id}`}
          prospectId={id}
          liveLabel={t.today.live}
          queuedLabel={t.log.offline}
        />
      </div>

      {/* Header: who they are and how to reach them, nothing else. */}
      <header className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="h-display text-2xl sm:text-3xl">{prospect.name}</h1>
            <p className="mt-1 text-base text-ink-soft">
              {t.specialty[prospect.specialty]}
              {prospect.zone ? ` · ${prospect.zone}` : ''} · {t.country[prospect.country]}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Mónica already made the introduction for the leads she sent, so
                how the call opens depends on this. It belongs in the header,
                not three sections down under "Datos". */}
            {prospect.origin === 'referral' && (
              <span className="badge bg-brand-wash text-brand">
                ↗ {prospect.origin_note || t.origin.referral}
              </span>
            )}
            <Badge tone={stageTone[prospect.stage]}>{t.stage[prospect.stage]}</Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {tel ? (
            <a
              href={tel}
              className="flex min-h-[3.5rem] flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-lg font-semibold text-white hover:bg-brand-hover"
            >
              <IconPhone className="h-6 w-6" />
              {prospect.phone}
            </a>
          ) : (
            <span className="flex min-h-[3.5rem] flex-1 items-center justify-center rounded-2xl border border-dashed border-line-strong text-base text-ink-mute">
              {dict.common.none}
            </span>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[3.5rem] items-center justify-center gap-2 rounded-2xl border border-brand px-5 text-lg font-semibold text-brand hover:bg-brand hover:text-white sm:w-auto"
            >
              <IconWhatsApp className="h-6 w-6" />
              {t.detail.whatsapp}
            </a>
          )}
        </div>

        <p
          className={`mt-4 flex items-center gap-2 text-base ${
            overdue ? 'font-semibold text-warn' : 'text-ink-soft'
          }`}
        >
          <IconClock className="h-5 w-5 shrink-0" />
          {prospect.next_action_at ? (
            <>
              {t.detail.nextAction}: {smartStamp(prospect.next_action_at, locale, tz, now)}
              {prospect.next_action_text ? ` · ${prospect.next_action_text}` : ''}
            </>
          ) : (
            t.detail.noNextAction
          )}
        </p>

        {/* Ownership. A rep can pick up a lead nobody is working. */}
        <div className="mt-4 border-t border-line pt-4">
          {isAdmin ? (
            <form action={assignProspect} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="prospect_id" value={id} />
              <div>
                <label htmlFor="rep_id" className="field-label">
                  {t.detail.assign}
                </label>
                <select
                  id="rep_id"
                  name="rep_id"
                  defaultValue={prospect.rep_id ?? 'none'}
                  className="field-input"
                >
                  <option value="none">{t.list.unassigned}</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}
                      {r.active ? '' : ` (${t.team.inactive})`}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-secondary">
                {t.detail.reassign}
              </button>
            </form>
          ) : isUnassigned ? (
            <form action={takeProspect}>
              <input type="hidden" name="prospect_id" value={id} />
              <button type="submit" className="btn-primary min-h-[3rem]">
                {t.list.take}
              </button>
            </form>
          ) : (
            <p className="text-base text-ink-soft">
              {t.detail.assign}:{' '}
              <span className="font-medium text-ink">
                {isMine
                  ? (t.list.taken)
                  : (repName.get(prospect.rep_id!) ?? t.list.unassigned)}
              </span>
            </p>
          )}
        </div>
      </header>

      {/* Converting a won prospect into a paying client. Never automatic. */}
      {prospect.stage === 'won' && (
        <section className="mt-4 rounded-2xl border border-ok/40 bg-ok-soft p-4">
          {prospect.converted_clinic_id ? (
            <p className="flex flex-wrap items-center gap-3 text-base text-ink">
              <span className="font-medium">{t.detail.convertedTo}</span>
              {isAdmin && (
                <Link
                  href={`/clinicas/${prospect.converted_clinic_id}`}
                  className="font-medium text-brand-accent underline"
                >
                  {t.detail.openClient}
                </Link>
              )}
            </p>
          ) : isAdmin ? (
            <>
              <p className="text-base text-ink-soft">{t.detail.convertHelp}</p>
              <Link
                href={`/clinicas/nova?prospect=${prospect.id}`}
                className="btn-primary mt-3 min-h-[3rem]"
              >
                {t.detail.convert}
              </Link>
            </>
          ) : prospect.conversion_requested_at ? (
            <p className="text-base text-ink">
              <span className="font-medium">{t.detail.convertRequested}</span> ·{' '}
              {t.detail.requestSent}
            </p>
          ) : (
            <form action={requestConversion}>
              <input type="hidden" name="prospect_id" value={id} />
              <input
                type="hidden"
                name="note"
                value={`${t.detail.convertRequest}: ${prospect.name}`}
              />
              <p className="mb-3 text-base text-ink-soft">{t.detail.convertHelp}</p>
              <button type="submit" className="btn-primary min-h-[3rem]">
                {t.detail.convertRequest}
              </button>
            </form>
          )}
        </section>
      )}

      {/* What we know about the place. The address is a map link because a rep
          who is going to visit needs directions, not a string to retype. */}
      {(prospect.address || prospect.website || prospect.origin_note) && (
        <section className="mt-4">
          <h2 className="mb-3 font-mid text-xl font-semibold text-ink">{t.detail.details}</h2>
          <dl className="card divide-y divide-line">
            {prospect.address && (
              <div className="p-4">
                <dt className="label-caps">{t.detail.address}</dt>
                <dd className="mt-1">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${prospect.address}, ${prospect.zone ?? ''} ${t.country[prospect.country]}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[2.75rem] items-center text-base text-ink underline decoration-line-strong underline-offset-4 hover:text-brand-accent"
                  >
                    {prospect.address}
                  </a>
                </dd>
              </div>
            )}
            {prospect.website && (
              <div className="p-4">
                <dt className="label-caps">{t.detail.website}</dt>
                <dd className="mt-1">
                  <a
                    href={
                      prospect.website.startsWith('http')
                        ? prospect.website
                        : `https://${prospect.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[2.75rem] items-center break-all text-base text-ink underline decoration-line-strong underline-offset-4 hover:text-brand-accent"
                  >
                    {prospect.website}
                  </a>
                </dd>
              </div>
            )}
            <div className="p-4">
              <dt className="label-caps">{t.detail.origin}</dt>
              <dd className="mt-1 text-base text-ink-soft">
                {t.origin[prospect.origin]}
                {prospect.origin_note ? ` · ${prospect.origin_note}` : ''}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Contacts: the doctor, the receptionist, each with their own notes. */}
      <section className="mt-4">
        <h2 className="mb-3 font-mid text-xl font-semibold text-ink">{t.detail.contacts}</h2>
        {contacts.length === 0 ? (
          <p className="text-base text-ink-mute">{t.detail.noContacts}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contacts.map((c) => {
              const contactTel = telHref(c.phone, prospect.country)
              return (
                <li key={c.id} className="card p-4">
                  <p className="text-base font-medium text-ink">
                    {c.name}{' '}
                    <span className="font-normal text-ink-mute">· {t.contactRole[c.role]}</span>
                  </p>
                  {c.notes && <p className="mt-1 text-base text-ink-soft">{c.notes}</p>}
                  {contactTel && (
                    <a
                      href={contactTel}
                      className="mt-2 inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-line-strong px-4 text-base font-medium text-ink hover:border-ink"
                    >
                      <IconPhone className="h-5 w-5" />
                      {c.phone}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <ContactForm prospectId={id} dict={dict} />
      </section>

      {/* The thread. Oldest first, newest at the bottom, like a chat. */}
      <section className="mt-6">
        <h2 className="mb-3 font-mid text-xl font-semibold text-ink">{t.detail.history}</h2>
        {activities.length === 0 ? (
          <p className="text-base text-ink-mute">{t.detail.noHistory}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {activities.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl rounded-tl-sm border border-line bg-surface-sunken px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-ink">
                    {a.result ? t.result[a.result] : t.activityType[a.type]}
                  </span>
                  <span className="text-sm text-ink-mute">
                    {dateTimeIn(a.created_at, locale, tz)}
                    {a.rep_id ? ` · ${repName.get(a.rep_id) ?? ''}` : ''}
                  </span>
                </div>
                {a.note && <p className="mt-1 text-base text-ink-soft">{a.note}</p>}
                {a.next_action_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-mute">
                    <IconClock className="h-4 w-4" />
                    {smartStamp(a.next_action_at, locale, tz, now)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Always reachable, never scrolls away. */}
      <div className="mt-6">
        <LogButton prospectId={id} prospectName={prospect.name} strings={crmStrings(dict)} />
      </div>
    </div>
  )
}
