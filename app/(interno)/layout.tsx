import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { getDict } from '@/lib/i18n'
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
  if (user.role !== 'interno') redirect('/hoje')

  const { locale, dict } = await getDict()

  const nav: NavItem[] = [
    { href: '/clinicas', label: dict.internoNav.clinicas, icon: <IconClinic /> },
    { href: '/consumo', label: dict.internoNav.consumo, icon: <IconUsage /> },
    { href: '/atividade', label: dict.internoNav.atividade, icon: <IconActivity /> },
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
