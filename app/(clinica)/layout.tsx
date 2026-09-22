import { getDict } from '@/lib/i18n'
import { requireClinicContext } from '@/lib/clinic-context'
import { panelLinks } from '@/lib/panels'
import { Shell, type NavItem } from '@/components/Shell'
import { ViewingAsBar } from '@/components/ViewingAsBar'
import { ClinicMark } from '@/components/clinic/ClinicMark'
import {
  IconToday,
  IconBookings,
  IconHours,
  IconCalls,
  IconTelma,
} from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'

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

  // Two groups, because the three calendar words were the first thing anybody
  // had to decode: Agenda, Citas and Horarios all sound like the same drawer.
  // The split says which ones are today's work and which are settings, and
  // "Agenda" becomes "Hoy" so that its name is the answer rather than another
  // word for diary.
  //
  // The simulator is gone from here. It wrote real rows to prove the loop
  // before there was a telephone, and there is a telephone now, so on a panel
  // a clinic looks at it is one more thing to explain and one more way to put
  // an invented booking in a real diary. The route still exists.
  const day = dict.clinicNav.groupDay
  const setup = dict.clinicNav.groupSetup
  const nav: NavItem[] = [
    { href: '/hoje', label: dict.clinicNav.hoje, icon: <IconToday />, group: day },
    { href: '/marcacoes', label: dict.clinicNav.marcacoes, icon: <IconBookings />, group: day },
    { href: '/conversas', label: dict.clinicNav.chamadas, icon: <IconCalls />, group: day },
    { href: '/horarios', label: dict.clinicNav.horarios, icon: <IconHours />, group: setup },
    { href: '/telma', label: dict.clinicNav.telma, icon: <IconTelma />, group: setup },
  ]

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
