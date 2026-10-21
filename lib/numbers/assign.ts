import { createAdminClient } from '@/lib/supabase/admin'
import { sendNumberReadyEmail } from '@/lib/onboarding/email-sender'
import { isRealProviderRef } from '@/lib/phone-state'
import { isOnboardingLocale, DEFAULT_ONBOARDING_LOCALE } from '@/lib/onboarding/locale'

/**
 * Handing a clinic the line that finally arrived.
 *
 * ── WHY THIS IS A PLAIN FUNCTION AND NOT THE ACTION ───────────────────────
 * Two things do this, and only one of them has a logged-in person behind it.
 * The panel calls it through a server action that checks the role; the
 * command line calls it directly, because the number arrives in an email from
 * Twilio support and somebody at a terminal is who reads that email. Putting
 * the work in the action would have meant the script reimplementing it, and a
 * second implementation of "tell the clinic its telephone is live" is a second
 * place for that email to come out wrong.
 *
 * Nothing here checks who is asking. The action does that, and the script is
 * run by somebody holding the service role key, which is the same authority.
 */
export interface AssignResult {
  ok: boolean
  error?: string
  emailed?: boolean
  clinicName?: string
  email?: string
}

export async function assignNumberCore(input: {
  clinicId: string
  /** E.164, as Twilio returned it. */
  number: string
  /** Twilio's own id for the line, so it can be released later. */
  providerRef: string
}): Promise<AssignResult> {
  if (!isRealProviderRef(input.providerRef)) {
    return { ok: false, error: 'O identificador parece um PNdemo: não é uma linha real.' }
  }
  if (!/^\+\d{8,15}$/.test(input.number.replace(/\s/g, ''))) {
    return { ok: false, error: 'O número tem de vir em E.164, por exemplo +351300602615.' }
  }

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('id, name, contact_email, language, phone_source, phone_provider_ref')
    .eq('id', input.clinicId)
    .maybeSingle()

  if (!clinic) return { ok: false, error: 'Clínica não encontrada.' }

  // A clinic already answering somewhere must not be moved: its patients are
  // dialling the old number and nothing would tell them otherwise. The
  // placeholder can be replaced freely, because nobody has ever dialled it.
  if (isRealProviderRef(clinic.phone_provider_ref as string | null)) {
    return { ok: false, error: 'Esta clínica já tem uma linha real atribuída.' }
  }

  const number = input.number.replace(/\s/g, '')
  const { error } = await admin
    .from('clinics')
    .update({ assigned_phone: number, phone_provider_ref: input.providerRef })
    .eq('id', input.clinicId)
  if (error) return { ok: false, error: error.message }

  const locale = isOnboardingLocale(clinic.language as string)
    ? (clinic.language as 'pt' | 'es')
    : DEFAULT_ONBOARDING_LOCALE

  const mail = await sendNumberReadyEmail({
    clinicName: (clinic.name as string) ?? '',
    email: (clinic.contact_email as string) ?? '',
    phoneNumber: number,
    // 'ported' is the clinic that kept its own number: this line is the hidden
    // destination of its forward, not a number to hand out.
    forwarding: clinic.phone_source === 'ported',
    dashboardUrl:
      process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://app.telmaatende.com',
    locale,
  })

  await admin.from('activity_log').insert({
    clinic_id: input.clinicId,
    type: mail.sent ? 'number_assigned' : 'needs_attention',
    message: mail.sent
      ? `Número ${number} atribuído e comunicado à clínica.`
      : `Número ${number} atribuído, mas o email não saiu (${mail.error ?? mail.via}). Avise à mão.`,
  })

  return {
    ok: true,
    emailed: mail.sent,
    clinicName: (clinic.name as string) ?? '',
    email: (clinic.contact_email as string) ?? '',
  }
}

/** The clinics still waiting for a line. */
export async function clinicsAwaitingNumber(): Promise<
  Array<{
    id: string
    name: string
    email: string | null
    /** The region id, as the sign-up stored it: 'pt-lisboa', 'es-madrid'. */
    region: string | null
    /** 'PT' or 'ES', derived from the region. */
    country: 'PT' | 'ES' | null
    phoneSource: string | null
    ownNumber: string | null
    createdAt: string
  }>
> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('id, name, contact_email, region, phone_source, phone_provider_ref, porting_details, created_at')
    .neq('status', 'cancelada')
    .order('created_at', { ascending: true })

  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((c) => !isRealProviderRef(c.phone_provider_ref as string | null))
    .map((c) => ({
      id: c.id as string,
      name: (c.name as string) ?? '',
      email: (c.contact_email as string) ?? null,
      region: (c.region as string) ?? null,
      country: regionCountry(c.region as string | null),
      phoneSource: (c.phone_source as string) ?? null,
      ownNumber:
        ((c.porting_details as { current_number?: string } | null)?.current_number ?? null) || null,
      createdAt: (c.created_at as string) ?? '',
    }))
}

/**
 * The shelf: numbers bought before anybody needed them.
 *
 * Twilio will not sell Portuguese or Spanish numbers over the API, and has no
 * API to place or track the order either. What it will do is let an approved
 * regulatory bundle cover more numbers of the same type and country. So the
 * wait moves to us: we order in batches, days before anybody signs up, and a
 * sign-up takes one off the shelf in the same second.
 */
export async function stockLevels(): Promise<
  Array<{ country: string; region: string | null; free: number; taken: number }>
> {
  const admin = createAdminClient()
  const { data } = await admin.from('phone_stock').select('country, region, clinic_id, claimed_at')
  const bucket = new Map<string, { country: string; region: string | null; free: number; taken: number }>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const key = `${r.country}|${r.region ?? ''}`
    const row = bucket.get(key) ?? {
      country: r.country as string,
      region: (r.region as string) ?? null,
      free: 0,
      taken: 0,
    }
    if (r.clinic_id || r.claimed_at) row.taken += 1
    else row.free += 1
    bucket.set(key, row)
  }
  return [...bucket.values()].sort((a, b) => a.country.localeCompare(b.country))
}

export async function addToStock(input: {
  number: string
  providerRef: string
  country: 'PT' | 'ES'
  region?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!isRealProviderRef(input.providerRef)) {
    return { ok: false, error: 'O identificador parece um PNdemo: não é uma linha real.' }
  }
  const number = input.number.replace(/\s/g, '')
  if (!/^\+\d{8,15}$/.test(number)) {
    return { ok: false, error: 'O número tem de vir em E.164, por exemplo +351300602615.' }
  }
  const admin = createAdminClient()
  const { error } = await admin.from('phone_stock').insert({
    number,
    provider_ref: input.providerRef,
    country: input.country,
    region: input.region ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** The numbers we already know about, by E.164, so a sync can skip them. */
export async function knownNumbers(): Promise<Set<string>> {
  const admin = createAdminClient()
  const [stock, clinics] = await Promise.all([
    admin.from('phone_stock').select('number'),
    admin.from('clinics').select('assigned_phone'),
  ])
  const known = new Set<string>()
  for (const r of (stock.data ?? []) as Array<{ number?: string }>) {
    if (r.number) known.add(r.number.replace(/\s/g, ''))
  }
  for (const r of (clinics.data ?? []) as Array<{ assigned_phone?: string | null }>) {
    if (r.assigned_phone) known.add(r.assigned_phone.replace(/\s/g, ''))
  }
  return known
}

/** 'es-madrid' is Spain. Derived here rather than imported, because the
 *  catalogue knows about regions we do not stock numbers for. */
function regionCountry(region: string | null): 'PT' | 'ES' | null {
  if (!region) return null
  if (region.startsWith('pt-')) return 'PT'
  if (region.startsWith('es-')) return 'ES'
  return null
}

/** Takes a free line off the shelf for this country, preferring its region. */
export async function claimForClinic(
  country: 'PT' | 'ES',
  region: string | null
): Promise<{ number: string; providerRef: string } | null> {
  const admin = createAdminClient()
  for (const withRegion of region ? [true, false] : [false]) {
    const q = admin
      .from('phone_stock')
      .select('id, number, provider_ref')
      .is('clinic_id', null)
      .is('claimed_at', null)
      // ── THE SHARED LINE IS NOT STOCK ──────────────────────────────────
      // The same rule as claimFromStock, which had it and this did not. A
      // shared line is unclaimed and unassigned by definition, so it matches
      // this query perfectly, and `limit(1)` could hand back nothing else:
      // the database refuses to mark it claimed, the update returns nothing,
      // and a clinic that had been waiting weeks for a number was told again
      // that there were none, with a free one sitting on the shelf behind it.
      .eq('shared', false)
      .eq('country', country)
    if (withRegion && region) q.eq('region', region)

    const { data } = await q.limit(1).maybeSingle()
    if (!data) continue

    const { data: taken } = await admin
      .from('phone_stock')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', (data as { id: string }).id)
      .is('claimed_at', null)
      .select('number, provider_ref')
      .maybeSingle()

    if (taken) {
      const row = taken as { number: string; provider_ref: string }
      return { number: row.number, providerRef: row.provider_ref }
    }
  }
  return null
}
