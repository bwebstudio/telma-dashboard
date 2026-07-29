import type { MetadataRoute } from 'next'

// PWA manifest, served at /manifest.webmanifest.
// start_url is "/" so the app opens wherever the signed in user belongs: a rep
// lands on today's calls, the internal team on the client panel.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Telma · Painel',
    short_name: 'Telma',
    description: 'Painel de gestão e CRM comercial da Telma Atende.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F2EA',
    theme_color: '#A94A27',
    lang: 'pt',
    dir: 'ltr',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Same artwork, generous margin, so Android can crop it to any shape.
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Hoje', short_name: 'Hoje', url: '/crm/hoje' },
      { name: 'Nova clínica', short_name: 'Nova', url: '/crm/prospetos/novo' },
    ],
  }
}
