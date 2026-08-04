import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { canOpenPanel, homePathFor } from '@/lib/access'
import { getDict } from '@/lib/i18n'
import { getVisitingClinic } from '@/lib/clinic-context'
import { panelLinks } from '@/lib/panels'
import { Shell, type NavItem } from '@/components/Shell'
import { IconClinic, IconUsage, IconActivity } from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'

export const dynamic = 'force-dynamic'

export default async function InternoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAppUser()
  if (!user) redirect('/login')
  // The client operation belongs to the administrator alone. A sales rep lands
  // back in the funnel, which is the only thing they are meant to see.
  if (!canOpenPanel(user, 'interno')) redirect(homePathFor(user))

  const { locale, dict } = await getDict()
  const visiting = await getVisitingClinic()

  // "Clientes" is the operation of clinics that already pay. "Comercial" is the
  // funnel of clinics that are not clients yet. They are two panels in the
  // switcher above, not two links in the same list: the team never reads a
  // prospect as a customer.
  const nav: NavItem[] = [
    { href: '/clinicas', label: dict.internoNav.clinicas, icon: <IconClinic /> },
    { href: '/consumo', label: dict.internoNav.consumo, icon: <IconUsage /> },
    { href: '/atividade', label: dict.internoNav.atividade, icon: <IconActivity /> },
  ]

  return (
    <Shell
      nav={nav}
      panel="interno"
      panelLabel={dict.panels.interno}
      panels={panelLinks(user, dict, visiting && { clinicName: visiting.name })}
      switchLabel={dict.panels.switch}
      locale={locale}
      userLabel={user.full_name ?? user.email ?? 'Bweb Studio'}
      langLabel={dict.common.language}
      signOutLabel={dict.common.signOut}
    >
      {isDemo() && <DemoBar role="interno" />}
      {children}
    </Shell>
  )
}
