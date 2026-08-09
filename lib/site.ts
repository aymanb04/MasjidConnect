// The canonical public origin, used by the metadata layer (metadataBase,
// canonical URLs, OpenGraph), robots.txt and the sitemap.
//
// Deliberately a constant, NOT process.env.NEXT_PUBLIC_SITE_URL. That variable
// is the *auth redirect* origin and correctly differs per environment —
// `http://localhost:3000` in dev, and it was still pointing at the old
// `masjid-connect-steel.vercel.app` host locally. Feeding it into the metadata
// would publish canonical tags, a sitemap and OG URLs for whatever host the
// build happened to run on, which tells Google the site lives at the preview
// domain and splits it from the real one.
//
// The canonical origin is a property of the product, not of the deployment:
// there is exactly one public domain, and a preview build should still declare
// it. Change this only if the domain itself changes.
export const SITE_URL = 'https://masjidconnect.be'
