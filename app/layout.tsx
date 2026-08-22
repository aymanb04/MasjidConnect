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

// Signed-in visitors who open the bookmarked root used to watch the marketing
// page for as long as it took the JS bundle to hydrate — 229 ms on desktop but
// ~1.5 s on a phone, because the old redirect lived in a React effect and could
// not run any earlier. This runs synchronously while the HTML is still being
// parsed, so the sales pitch is never painted at all.
//
// Only the session's PRESENCE is checked, never its validity: an expired access
// token still means "logged in" (it refreshes on /dashboard), and anything
// genuinely stale is bounced to /login there. Crawlers have no localStorage, so
// they always get the full marketing page and SEO is untouched.
const SUPABASE_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
const BOUNCE_IF_AUTHED = `(function(){try{
if(location.pathname!=='/')return;
if(!localStorage.getItem('sb-${SUPABASE_REF}-auth-token'))return;
location.replace('/dashboard');
}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body>
        {/* Must stay the first thing in <body> — it only beats the paint if the
            browser runs it before parsing the markup below. */}
        <script dangerouslySetInnerHTML={{ __html: BOUNCE_IF_AUTHED }} />
        {children}
      </body>
    </html>
  )
}
