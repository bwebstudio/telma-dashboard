import { redirect } from 'next/navigation'
import { getAppUser, homePathFor } from '@/lib/auth'
import { getDict } from '@/lib/i18n'
import { Shell, type NavItem } from '@/components/Shell'
import { IconToday, IconBookings, IconHours, IconCalls } from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'

export const dynamic = 'force-dynamic'

export default async function ClinicaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAppUser()
  if (!user) redirect('/login')
  // This panel belongs to a client clinic. Internal roles (including the
  // sales reps) go to their own section instead.
  if (user.role !== 'clinica') redirect(homePathFor(user))

  const { locale, dict } = await getDict()

  const nav: NavItem[] = [
    { href: '/hoje', label: dict.clinicNav.hoje, icon: <IconToday /> },
    { href: '/marcacoes', label: dict.clinicNav.marcacoes, icon: <IconBookings /> },
    { href: '/horarios', label: dict.clinicNav.horarios, icon: <IconHours /> },
    { href: '/chamadas', label: dict.clinicNav.chamadas, icon: <IconCalls /> },
  ]

  return (
    <Shell
      nav={nav}
      variant="clinica"
      locale={locale}
      userLabel={user.clinic?.name ?? dict.clinicNav.conta}
      langLabel={dict.common.language}
      signOutLabel={dict.common.signOut}
      accountHref="/conta"
    >
      {isDemo() && <DemoBar role="clinica" />}
      {children}
    </Shell>
  )
}
