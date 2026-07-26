import type { Metadata } from 'next'
import { display, grotesk } from '@/lib/fonts'
import { getLocale } from '@/lib/i18n'
import './globals.css'

export const metadata: Metadata = {
  title: 'Telma · Painel',
  description: 'Painel de gestão da Telma.',
  robots: { index: false, follow: false },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    <html lang={locale} className={`${display.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  )
}
