import { NextResponse } from 'next/server'
import { dictionaries, defaultLocale, isLocale } from '@/content'

/**
 * The installed app's name, language and shortcuts.
 *
 * ── WHY THIS IS A ROUTE AND NOT app/manifest.ts ───────────────────────────
 * It was a static file, one for everybody, and it carried the CRM's two
 * shortcuts and a Portuguese name. Two surfaces live at this domain: the panel
 * a clinic uses, and the sales CRM. A receptionist in Spain who installed the
 * app got "Telma · Painel" on her home screen and two shortcuts into a panel
 * her account cannot open, which redirect her to her own.
 *
 * A manifest is fetched without credentials, so it cannot read the session and
 * work out who is asking. The page knows, because it rendered for somebody, so
 * the layout says who in the URL: `?lang=` for the words, `?scope=` for the
 * shortcuts. Everything else about the two is identical.
 *
 * ── WHY NOT TWO FILES ─────────────────────────────────────────────────────
 * Two manifests at two paths would mean two icon lists, two theme colours and
 * two chances to change one and forget the other. The difference between them
 * is a name and two links.
 */

// Dynamic, because the answer depends on the query: `force-static` served the
// first caller's manifest to everybody, which is the bug this route exists to
// fix wearing a different hat.
export const dynamic = 'force-dynamic'

const SHORTCUTS = {
  clinica: {
    pt: [
      { name: 'Agenda', short_name: 'Agenda', url: '/hoje' },
      { name: 'Marcações', short_name: 'Marcações', url: '/marcacoes' },
    ],
    es: [
      { name: 'Agenda', short_name: 'Agenda', url: '/hoje' },
      { name: 'Citas', short_name: 'Citas', url: '/marcacoes' },
    ],
  },
  crm: {
    pt: [
      { name: 'Hoje', short_name: 'Hoje', url: '/crm/hoje' },
      { name: 'Nova clínica', short_name: 'Nova', url: '/crm/prospetos/novo' },
    ],
    es: [
      { name: 'Hoy', short_name: 'Hoy', url: '/crm/hoje' },
      { name: 'Nueva clínica', short_name: 'Nueva', url: '/crm/prospetos/novo' },
    ],
  },
} as const

export async function GET(request: Request) {
  const url = new URL(request.url)
  const asked = url.searchParams.get('lang') ?? ''
  const lang = isLocale(asked) ? asked : defaultLocale
  const scope = url.searchParams.get('scope') === 'crm' ? 'crm' : 'clinica'
  const dict = dictionaries[lang]

  return NextResponse.json(
    {
      name: dict.meta.title,
      short_name: 'Telma',
      description: dict.meta.description,
      // One installed app per surface and language, so a phone that has the
      // clinic panel installed does not have it renamed by somebody opening
      // the CRM on it.
      id: `/?app=${scope}-${lang}`,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#FFFFFF',
      theme_color: '#111111',
      lang,
      dir: 'ltr',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // Same artwork, generous margin, so Android can crop it to any shape.
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: SHORTCUTS[scope][lang === 'es' ? 'es' : 'pt'],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  )
}
