import Link from 'next/link'
import { requireCrmSession } from '@/lib/crm/data'
import { Shell, type NavItem } from '@/components/Shell'
import { IconToday, IconClinic, IconPlus, IconTeam } from '@/components/icons'
import { DemoBar } from '@/components/DemoBar'
import { isDemo } from '@/lib/demo/config'

export const dynamic = 'force-dynamic'

// Sales CRM. A separate section from "Clínicas", on purpose: that one is the
// operation of paying clients, this one is the funnel of clinics being sold to.
// Same Supabase session, same panel, different section.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, dict, locale } = await requireCrmSession()
  const t = dict.crm

  const nav: NavItem[] = [
    { href: '/crm/hoje', label: t.nav.hoje, icon: <IconToday /> },
    { href: '/crm/prospetos', label: t.nav.prospetos, icon: <IconClinic /> },
    { href: '/crm/prospetos/novo', label: t.nav.novo, icon: <IconPlus /> },
  ]
  if (isAdmin) {
    nav.push({ href: '/crm/equipa', label: t.nav.equipa, icon: <IconTeam /> })
  }

  return (
    <Shell
      nav={nav}
      variant="crm"
      variantLabel={t.nav.section}
      locale={locale}
      userLabel={user.full_name ?? user.email ?? t.nav.section}
      langLabel={dict.common.language}
      signOutLabel={dict.common.signOut}
      aside={
        isAdmin ? (
          <Link
            href="/clinicas"
            className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-base text-ink-mute hover:bg-paper-3 hover:text-ink"
          >
            ← {t.nav.backToPanel}
          </Link>
        ) : null
      }
    >
      {isDemo() && <DemoBar role={user.role} />}
      {/* The sidebar carries this link on a desktop; the bottom tab bar on a
          phone is reserved for the CRM itself, so the way back lives here. */}
      {isAdmin && (
        <Link
          href="/clinicas"
          className="mb-4 inline-block text-base text-ink-mute hover:text-accent md:hidden"
        >
          ← {t.nav.backToPanel}
        </Link>
      )}
      {children}
    </Shell>
  )
}
