import { getDict } from '@/lib/i18n'
import { requireClinicContext } from '@/lib/clinic-context'
import { panelLinks } from '@/lib/panels'
import { Shell, type NavItem } from '@/components/Shell'
import { ViewingAsBar } from '@/components/ViewingAsBar'
import { ClinicMark } from '@/components/clinic/ClinicMark'
import {
  IconToday,
  IconBookings,
  IconPatients,
  IconHours,
  IconCalls,
  IconTelma,
  IconSetup,
} from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { WelcomeTour } from '@/components/clinic/WelcomeTour'
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
  const awaitingSetup = clinic?.status === 'por_configurar'
  // ── A MENU THAT SAYS WHAT TELMA DOES HERE ───────────────────────────────
  // A clinic that chose "atende e toma recados" has no diary for Telma to
  // write in, and two entries leading to two permanently empty screens are
  // not a hint about what they could buy: they are two questions on every
  // visit -- do I have to set this up, why is it empty, is she booking
  // behind my back. The entries come back the moment the answer in Telma
  // changes, which is where that choice belongs. Patients and conversations
  // keep their order either way, so nothing moves under the hand of somebody
  // who switches.
  const books = clinic?.takes_bookings !== false
  const day = dict.clinicNav.groupDay
  const setup = dict.clinicNav.groupSetup
  const nav: NavItem[] = [
    // ── WHILE THERE IS STILL SOMETHING TO SET UP ────────────────────────
    // First, in a group of its own, and gone the moment the clinic activates.
    // A new clinic was being asked to work out from a six item sidebar which
    // of them was its job today; this says it, and takes itself away rather
    // than becoming one more entry nobody opens again.
    ...(awaitingSetup
      ? [
          {
            href: '/comecar',
            label: dict.comecar.navItem,
            icon: <IconSetup />,
            group: dict.comecar.navGroup,
          },
        ]
      : []),
    // The same first entry in both modes, and a different screen behind it:
    // the diary where there is one, what Telma did where there is not. The
    // name changes with it, because "Agenda" over a list of messages is the
    // contradiction this was meant to end.
    {
      href: '/hoje',
      label: books ? dict.clinicNav.hoje : dict.clinicNav.dia,
      icon: <IconToday />,
      group: day,
      tour: 'hoje',
    },
    ...(books
      ? [
          { href: '/marcacoes', label: dict.clinicNav.marcacoes, icon: <IconBookings />, group: day, tour: 'marcacoes' },
        ]
      : []),
    // Beside the bookings, not down with the settings. A record is looked at
    // while somebody is on the telephone, which is the same work as answering
    // them, and the reminders waiting to go out live on it.
    { href: '/pacientes', label: dict.clinicNav.pacientes, icon: <IconPatients />, group: day, tour: 'pacientes' },
    { href: '/conversas', label: dict.clinicNav.chamadas, icon: <IconCalls />, group: day, tour: 'conversas' },
    { href: '/horarios', label: dict.clinicNav.horarios, icon: <IconHours />, group: setup, tour: 'horarios' },
    { href: '/telma', label: dict.clinicNav.telma, icon: <IconTelma />, group: setup, tour: 'telma' },
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
      langLabel={dict.common.switchLanguage}
      signOutLabel={dict.common.signOut}
      accountMenu={{
        title: dict.conta.accountMenu,
        items: [
          { href: '/conta', label: dict.clinicNav.conta },
          { href: '/conta/faturacao', label: dict.conta.billingTitle },
          { href: '/conta/seguranca', label: dict.conta.securityTitle },
        ],
      }}
      accent={clinic?.accent}
      theme={clinic?.theme}
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
      {/* Once per person, and never to an administrator looking at somebody
          else's clinic: a tour of a panel that is not theirs, on a visit they
          will not repeat, and it would burn the real owner's one welcome.
          Whether it opens is the tour's own decision now, because `?tour=1`
          asks for it again and a layout does not get the query string. */}
      {!viewingAs && (
        <WelcomeTour
          dict={dict}
          clinicName={clinicName}
          // ── NOT WHILE THEY ARE STILL SETTING UP ───────────────────────
          // The tour is a walk round a panel, and a clinic in the middle of
          // the set-up has no day, no bookings and no conversations to be
          // walked round: it opened over the form and described screens that
          // were empty. Held back until she is answering, which is also the
          // moment it is worth having -- the first thing after activating is
          // the panel they just bought.
          welcomed={user.welcomed_at !== null || awaitingSetup}
          books={books}
        />
      )}
      {children}
    </Shell>
  )
}
