import { showcaseMode } from './demo/config'
import type { AppUser, UserRole } from './types'

// Who sees what. One file, one table, no other place in the app decides this.
//
// There are three panels and they never overlap:
//
//   clinica  the panel of one paying clinic: its own day, its own bookings.
//   interno  the operation of every client clinic (plans, minutes, activity).
//   crm      the sales funnel of clinics that are not clients yet.
//
// A prospect is not a client and a client is not a prospect. Keeping the panels
// disjoint at the routing level is what stops the two from ever being read as
// the same thing.
export type Panel = 'clinica' | 'interno' | 'crm'

export const PANEL_HOME: Record<Panel, string> = {
  clinica: '/hoje',
  interno: '/clinicas',
  crm: '/crm/hoje',
}

// The panels a role may open by itself. The order matters: the first one is
// where that role lands after signing in.
//
// 'interno' is the Bweb Studio administrator (info@bwebstudio.com). It is the
// only role with more than one panel, and the only one that can also open a
// client's panel — through an explicit "view as", never as a home.
//
// 'comercial' (Sonia, Domingos) is sales only. It never reaches the client
// operation: no minutes, no phone numbers, no technical configuration.
const PANELS_BY_ROLE: Record<UserRole, Panel[]> = {
  interno: ['interno', 'crm'],
  comercial: ['crm'],
  clinica: ['clinica'],
}

export function panelsFor(user: AppUser | null): Panel[] {
  if (!user) return []
  // On a showcase deployment there is one panel and it is the clinic's.
  //
  // The internal panel and the CRM are where Sonia and Domingos do real work:
  // ringing practices, setting reminders, moving prospects along. A demo that
  // can draw those screens is a demo somebody will one day act on, and the
  // safest way to stop that is for them not to exist there at all.
  //
  // Enforced here rather than by leaving those accounts out of the demo
  // database, because the database is the thing most likely to be copied,
  // restored or reseeded by somebody in a hurry.
  if (showcaseMode()) return user.role === 'clinica' ? ['clinica'] : []
  return PANELS_BY_ROLE[user.role] ?? []
}

export function canOpenPanel(user: AppUser | null, panel: Panel): boolean {
  return panelsFor(user).includes(panel)
}

// The administrator: full reach over both internal panels, and the only one
// who can look inside a client's panel.
export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'interno'
}

// Where a user lands after signing in, and where a guard sends somebody who
// knocked on a door that is not theirs.
export function homePathFor(user: AppUser | null): string {
  const [first] = panelsFor(user)
  if (first) return PANEL_HOME[first]
  // Signed in with no panel goes to a page that says so, not back to the sign-in
  // screen. Sending them to /login built a loop — the middleware sees a valid
  // session there and returns them to /, which sends them back — and the loop
  // ends on the sign-in form, which everybody reads as a wrong password.
  return user ? '/sem-acesso' : '/login'
}

// Which panel a path belongs to. Used by the switcher to mark the current one.
export function panelOfPath(pathname: string): Panel | null {
  if (pathname.startsWith('/crm')) return 'crm'
  if (
    pathname.startsWith('/clinicas') ||
    pathname.startsWith('/consumo') ||
    pathname.startsWith('/atividade')
  ) {
    return 'interno'
  }
  if (
    pathname.startsWith('/hoje') ||
    pathname.startsWith('/marcacoes') ||
    pathname.startsWith('/horarios') ||
    pathname.startsWith('/chamadas') ||
    pathname.startsWith('/conversas') ||
    pathname.startsWith('/test-call') ||
    pathname.startsWith('/conta')
  ) {
    return 'clinica'
  }
  return null
}
