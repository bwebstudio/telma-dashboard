'use server'

import { billingPortalUrl } from '@/lib/onboarding/stripe-client'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Where a clinic goes for its invoices, its card and its cancellation.
 *
 * Made on demand rather than stored: a portal link is a short-lived session
 * tied to one customer, and a stale one in a page that was left open is a
 * dead end. The clinic presses the button and gets a fresh door.
 *
 * Only its own. The customer id comes from the signed-in user's clinic and
 * never from the request, because a portal session opened on somebody else's
 * customer id is somebody else's card details.
 */
export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) return { error: 'not_allowed' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('stripe_customer_id')
    .eq('id', user.clinic_id)
    .maybeSingle()

  const customer = (data?.stripe_customer_id as string | null) ?? null
  if (!customer) return { error: 'no_customer' }

  const base =
    process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? 'https://app.telmaatende.com'
  const url = await billingPortalUrl(customer, `${base}/conta`)
  return url ? { url } : { error: 'stripe_unavailable' }
}
