import { requireCrmSession } from '@/lib/crm/data'
import { getVisitingClinic } from '@/lib/clinic-context'
import { panelLinks } from '@/lib/panels'
import { Shell, type NavItem } from '@/components/Shell'
import { IconToday, IconChart, IconClinic, IconPlus, IconTeam } from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'

export const dynamic = 'force-dynamic'

// Sales CRM. A separate panel from "Clientes", on purpose: that one is the
// operation of paying clients, this one is the funnel of clinics being sold to.
// Same Supabase session, same app, different panel — and for a sales rep it is
// the only panel that exists.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, dict, locale } = await requireCrmSession()
  const visiting = await getVisitingClinic()
  const t = dict.crm

  const nav: NavItem[] = [
    { href: '/crm/hoje', label: t.nav.hoje, icon: <IconToday /> },
    { href: '/crm/resumo', label: t.resumo.title, icon: <IconChart /> },
    { href: '/crm/prospetos', label: t.nav.prospetos, icon: <IconClinic /> },
    { href: '/crm/prospetos/novo', label: t.nav.novo, icon: <IconPlus /> },
  ]
  if (isAdmin) {
    nav.push({ href: '/crm/equipa', label: t.nav.equipa, icon: <IconTeam /> })
  }

  return (
    <Shell
      nav={nav}
      panel="crm"
      panelLabel={dict.panels.crm}
      // The way back to the client operation is the switcher, for whoever has
      // one. A rep has a single panel and sees no switcher at all.
      panels={panelLinks(user, dict, visiting && { clinicName: visiting.name })}
      switchLabel={dict.panels.switch}
      locale={locale}
      userLabel={user.full_name ?? user.email ?? t.nav.section}
      langLabel={dict.common.language}
      signOutLabel={dict.common.signOut}
    >
      {isDemo() && <DemoBar role={user.role} />}
      {children}
    </Shell>
  )
}
