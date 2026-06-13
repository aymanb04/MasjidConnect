/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    // Content-Security-Policy notes:
    // - 'unsafe-inline' on script-src is required by Next.js (hydration scripts)
    // - 'unsafe-eval' is required by Next.js webpack runtime in both dev and prod
    // - connect-src includes both supabase.co (REST/Auth) and supabase.in (Realtime WSS)
    // - Google Fonts: the stylesheet loads from fonts.googleapis.com (style-src),
    //   the woff2 files from fonts.gstatic.com (font-src). Without these the Inter
    //   font is CSP-blocked, falls back to a system font, and the resulting DOM
    //   diff triggers React hydration warnings on every page.
    // - frame-ancestors 'none' supersedes X-Frame-Options but both are kept for
    //   compatibility with older browsers that don't understand CSP
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',  value: csp },
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
