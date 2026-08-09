import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SITE_URL } from '@/lib/site'
import './globals.css'

// Self-hosted via next/font: no render-blocking Google Fonts request,
// no flash of fallback font on slow connections.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  // Required for the public pages: without it Next cannot turn the relative
  // OpenGraph image path into the absolute URL that WhatsApp and the crawlers
  // demand, and it warns on every build.
  metadataBase: new URL(SITE_URL),
  title: { default: 'MasjidConnect', template: '%s — MasjidConnect' },
  description: 'Digitaal platform voor moskee-onderwijs',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MasjidConnect',
  },
  icons: {
    icon: '/icon.svg',
    // icon-192.png, not a separate apple-touch-icon.png — that file was
    // referenced here but never existed, so iOS "add to home screen" fetched a
    // 404 and fell back to a screenshot of the page.
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1B6B4A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
