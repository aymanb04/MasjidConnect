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
    // This path was referenced for a long time without the file existing, so
    // iOS "add to home screen" fetched a 404. The asset now exists and is
    // full-bleed on purpose: iOS applies its own mask and composites any
    // transparency to black, so the transparent-cornered `any` icons would
    // come out with black corners here.
    apple: '/apple-touch-icon.png',
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
