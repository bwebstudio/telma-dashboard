import type { Metadata, Viewport } from 'next'
import { mono, sans } from '@/lib/fonts'
import { getDict, getLocale } from '@/lib/i18n'
import { PwaSetup } from '@/components/PwaSetup'
import './globals.css'

/**
 * Read per request, not written once at build.
 *
 * The tab said "Telma · Painel" to a clinic working in Spanish, because this
 * was a constant. The layout already awaits the locale to set <html lang>, so
 * the dictionary is one more await on a render that was never static.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict()
  return {
  title: dict.meta.title,
  description: dict.meta.description,
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  applicationName: 'Telma',
  appleWebApp: {
    capable: true,
    title: 'Telma',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  }
}

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
  // Zoom stays available: a rep reading a note in bright sun may need it.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    // Same decision the landing already took, for the same reason. Browser
    // extensions write their own attributes onto <html> before React hydrates
    // (data-thieve-chrome-ext, the various wallet and dark mode injectors), so
    // the server HTML and the live DOM legitimately differ on this one node.
    // It suppresses the warning for this node's attributes only: children still
    // hydrate normally, so a real mismatch anywhere in the app still reports.
    <html lang={locale} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <PwaSetup />
      </body>
    </html>
  )
}
