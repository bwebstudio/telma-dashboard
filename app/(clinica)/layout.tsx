import { getDict } from '@/lib/i18n'
import { requireClinicContext } from '@/lib/clinic-context'
import { panelLinks } from '@/lib/panels'
import { Shell, type NavItem } from '@/components/Shell'
import { ViewingAsBar } from '@/components/ViewingAsBar'
import { ClinicMark } from '@/components/clinic/ClinicMark'
import { IconBookings, IconCalls, IconHours, IconSimulate, IconTelma, IconToday } from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'
import { mockCallsEnabled } from '@/lib/mock-call'

export const dynamic = 'force-dynamic'

export default async function ClinicaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The guard, the clinic and the read only flag all come from one place.
  // A sales rep never gets past this line; the administrator only does after
  // explicitly opening a clinic from its file.
  const { user, clinic, viewingAs } = await requireClinicContext()
  const { locale, dict } = await getDict()

  const nav: NavItem[] = [
    { href: '/hoje', label: dict.clinicNav.hoje, icon: <IconToday /> },
    { href: '/marcacoes', label: dict.clinicNav.marcacoes, icon: <IconBookings /> },
    { href: '/horarios', label: dict.clinicNav.horarios, icon: <IconHours /> },
    { href: '/conversas', label: dict.clinicNav.chamadas, icon: <IconCalls /> },
    { href: '/telma', label: dict.clinicNav.telma, icon: <IconTelma /> },
  ]

  // Only where the page exists. A nav entry that leads to a 404 in production
  // is worse than no entry at all.
  if (mockCallsEnabled()) {
    nav.push({ href: '/test-call', label: dict.clinicNav.testCall, icon: <IconSimulate /> })
  }

  const clinicName = clinic?.name ?? dict.clinicNav.conta

  return (
    <Shell
      nav={nav}
      panel="clinica"
      panelLabel={viewingAs ? clinicName : dict.panels.clinica}
      panels={panelLinks(user, dict, viewingAs ? { clinicName } : null)}
      switchLabel={dict.panels.switch}
      locale={locale}
      userLabel={clinicName}
      langLabel={dict.common.language}
      signOutLabel={dict.common.signOut}
      accountHref="/conta"
      accent={clinic?.accent}
      brandMark={<ClinicMark logoUrl={clinic?.logo_url} clinicName={clinicName} />}
      banner={
        viewingAs ? (
          <ViewingAsBar
            clinicName={clinicName}
            label={dict.panels.viewingAs}
            readOnlyLabel={dict.panels.readOnly}
            exitLabel={dict.panels.exitView}
          />
        ) : undefined
      }
    >
      {isDemo() && <DemoBar role="clinica" />}
      {children}
    </Shell>
  )
}
