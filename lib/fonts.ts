import localFont from 'next/font/local'

// Same faces as the landing: Clash Display for headings, General Sans for body.
export const display = localFont({
  variable: '--font-display',
  display: 'swap',
  src: [
    { path: '../public/fonts/ClashDisplay-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ClashDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ClashDisplay-Semibold.woff2', weight: '600', style: 'normal' },
  ],
})

export const grotesk = localFont({
  variable: '--font-grotesk',
  display: 'swap',
  src: [
    { path: '../public/fonts/GeneralSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/GeneralSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/GeneralSans-Semibold.woff2', weight: '600', style: 'normal' },
  ],
})
