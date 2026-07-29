import { redirect } from 'next/navigation'
import { getAppUser, resolveHomePath } from '@/lib/auth'
import { getDict } from '@/lib/i18n'
import { Shell, type NavItem } from '@/components/Shell'
import { IconClinic, IconUsage, IconActivity, IconSales } from '@/components/icons'
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
  if (user.role !== 'interno') redirect(await resolveHomePath(user))

  const { locale, dict } = await getDict()

  // "Clínicas" is the operation of paying clients. "Comercial" is the sales
  // funnel of clinics that are not clients yet. Two separate sections so the
  // team never reads a prospect as a customer.
  const nav: NavItem[] = [
    { href: '/clinicas', label: dict.internoNav.clinicas, icon: <IconClinic /> },
    { href: '/consumo', label: dict.internoNav.consumo, icon: <IconUsage /> },
    { href: '/atividade', label: dict.internoNav.atividade, icon: <IconActivity /> },
    { href: '/crm', label: dict.crm.nav.section, icon: <IconSales /> },
  ]

  return (
    <Shell
      nav={nav}
      variant="interno"
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
