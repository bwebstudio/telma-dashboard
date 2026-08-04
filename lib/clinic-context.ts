import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUser } from './auth'
import { homePathFor, isAdmin } from './access'
import { createClient } from './supabase/server'
import { isDemo } from './demo/config'
import { readClinicOverride } from './demo/overrides'
import type { AppUser, Clinic } from './types'

// Demo mode has no database, so what the demo changed about itself lives in
// process memory. One place applies it, on the way out of the only function
// that hands a clinic to the panel.
function withDemoOverrides(clinic: Clinic | null): Clinic | null {
  if (!clinic || !isDemo()) return clinic
  return { ...clinic, ...readClinicOverride(clinic.id) }
}

// Set by the administrator from a clinic's file. Holds the id of the clinic
// whose panel is being looked at. Nobody else's browser is ever asked for it.
export const VIEW_CLINIC_COOKIE = 'telma_view_clinic'

export interface ClinicContext {
  user: AppUser
  /** The clinic every query on this panel must be filtered by. */
  clinicId: string
  clinic: Clinic | null
  /** True when the administrator is looking at a client's panel. */
  viewingAs: boolean
  /**
   * A visit is never an edit. Confirming a booking or changing the opening
   * hours is the clinic's decision and has to carry the clinic's name, so the
   * whole panel is read only while the administrator is inside it.
   */
  readOnly: boolean
}

// The clinic the administrator currently has open, if any. Null for everybody
// else, and null when there is no visit going on.
//
// Every panel asks for this, not only the clinic one: while a visit is open it
// stays in the switcher, so the way back is always in the same place and an
// open visit is never something you find out about by accident.
export const getVisitingClinic = cache(async function getVisitingClinic(): Promise<Clinic | null> {
  const user = await getAppUser()
  if (!isAdmin(user)) return null

  const id = (await cookies()).get(VIEW_CLINIC_COOKIE)?.value
  if (!id) return null

  const supabase = await createClient()
  const { data } = await supabase.from('clinics').select('*').eq('id', id).maybeSingle()
  return withDemoOverrides(data as Clinic | null)
})

// The single door into the clinic panel.
//
// A clinic user gets its own clinic and nothing else. The administrator gets
// the clinic it explicitly asked to look at, read only. Everybody else is sent
// back to their own home, which is what keeps a sales rep from ever landing on
// a client's day.
export const requireClinicContext = cache(async function requireClinicContext(): Promise<ClinicContext> {
  const user = await getAppUser()
  if (!user) redirect('/login')

  if (user.role === 'clinica') {
    // A clinic row without a clinic is a broken account, not a panel.
    if (!user.clinic_id) redirect('/login')
    return {
      user,
      clinicId: user.clinic_id,
      clinic: withDemoOverrides(user.clinic),
      viewingAs: false,
      readOnly: false,
    }
  }

  const visiting = await getVisitingClinic()
  if (visiting) {
    return { user, clinicId: visiting.id, clinic: visiting, viewingAs: true, readOnly: true }
  }

  redirect(homePathFor(user))
})
