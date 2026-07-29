import type { Metadata, Viewport } from 'next'
import { display, grotesk } from '@/lib/fonts'
import { getLocale } from '@/lib/i18n'
import { PwaSetup } from '@/components/PwaSetup'
import './globals.css'

export const metadata: Metadata = {
  title: 'Telma · Painel',
  description: 'Painel de gestão da Telma.',
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

export const viewport: Viewport = {
  themeColor: '#A94A27',
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
    <html lang={locale} className={`${display.variable} ${grotesk.variable}`}>
      <body>
        {children}
        <PwaSetup />
      </body>
    </html>
  )
}
