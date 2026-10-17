'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUser } from '@/lib/auth'
import { sendNumberReadyEmail } from '@/lib/onboarding/email-sender'
import { isRealProviderRef } from '@/lib/phone-state'
import { isOnboardingLocale, DEFAULT_ONBOARDING_LOCALE } from '@/lib/onboarding/locale'

/**
 * The line arrived. Give it to the clinic and tell them.
 *
 * ── WHY THIS IS NOT AUTOMATIC ─────────────────────────────────────────────
 * Portuguese national numbers are not sold over Twilio's API on this account.
 * They are ordered through support, quoted at three to five working days, and
 * delivered by a human in an email. So something has to carry the number from
 * that email into the clinic's row, and until Twilio opens self-serve
 * inventory for Portugal that something is us.
 *
 * What is automatic is everything after: the row, the webhook on the number,
 * the email to the clinic, and the note in its own activity log. The part a
 * person does is paste one number.
 *
 * ── WHY IT REFUSES TO OVERWRITE A REAL LINE ───────────────────────────────
 * A clinic already answering on a number would, if this ran twice, be moved
 * to a new one while its patients went on dialling the old. The placeholder
 * can be replaced freely because nobody has ever dialled it.
 */
export async function assignNumber(input: {
  clinicId: string
  /** E.164, as Twilio returned it. */
  number: string
  /** Twilio's own id for the line, so it can be released later. */
  providerRef: string
}): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  const user = await getAppUser()
  if (user?.role !== 'interno') return { ok: false, error: 'not_allowed' }

  if (!isRealProviderRef(input.providerRef)) {
    return { ok: false, error: 'provider_ref_looks_like_a_placeholder' }
  }

  const admin = createAdminClient()
  const { data: clinic } = await admin
    .from('clinics')
    .select('id, name, contact_email, language, phone_source, phone_provider_ref, assigned_phone')
    .eq('id', input.clinicId)
    .maybeSingle()

  if (!clinic) return { ok: false, error: 'clinic_not_found' }
  if (isRealProviderRef(clinic.phone_provider_ref as string | null)) {
    return { ok: false, error: 'already_has_a_real_number' }
  }

  const { error } = await admin
    .from('clinics')
    .update({ assigned_phone: input.number, phone_provider_ref: input.providerRef })
    .eq('id', input.clinicId)
  if (error) return { ok: false, error: error.message }

  const locale = isOnboardingLocale(clinic.language as string)
    ? (clinic.language as 'pt' | 'es')
    : DEFAULT_ONBOARDING_LOCALE

  const dashboardUrl =
    process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://app.telmaatende.com'

  const mail = await sendNumberReadyEmail({
    clinicName: (clinic.name as string) ?? '',
    email: (clinic.contact_email as string) ?? '',
    phoneNumber: input.number,
    // 'ported' is the clinic that kept its own number: this one is the hidden
    // destination of its forward, not a number to hand out.
    forwarding: clinic.phone_source === 'ported',
    dashboardUrl,
    locale,
  })

  await admin.from('activity_log').insert({
    clinic_id: input.clinicId,
    type: mail.sent ? 'number_assigned' : 'needs_attention',
    message: mail.sent
      ? `Número ${input.number} atribuído e comunicado à clínica.`
      : `Número ${input.number} atribuído, mas o email não saiu (${mail.error ?? mail.via}). Avise à mão.`,
  })

  return { ok: true, emailed: mail.sent }
}
