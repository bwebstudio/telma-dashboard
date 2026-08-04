import { panelsFor, PANEL_HOME, type Panel } from './access'
import type { PanelLink } from '@/components/Shell'
import type { AppUser } from './types'
import type { Dictionary } from '@/content'

// The panels this user may switch between, in the order the switcher shows
// them. A clinic being visited is added at the end: it is not a panel the
// administrator owns, it is a place they are currently standing in, and it
// disappears from the switcher the moment they leave it.
export function panelLinks(
  user: AppUser | null,
  dict: Dictionary,
  visiting?: { clinicName: string } | null | false
): PanelLink[] {
  const label: Record<Panel, string> = {
    interno: dict.panels.interno,
    crm: dict.panels.crm,
    clinica: dict.panels.clinica,
  }

  const links: PanelLink[] = panelsFor(user).map((panel) => ({
    panel,
    label: label[panel],
    href: PANEL_HOME[panel],
  }))

  if (visiting) {
    links.push({ panel: 'clinica', label: visiting.clinicName, href: PANEL_HOME.clinica })
  }

  return links
}
