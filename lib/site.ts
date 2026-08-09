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
// it.
//
// It must be the host that actually SERVES the site, not the prettier one:
// Vercel's primary domain is `www`, and the apex 307-redirects to it. Declaring
// the apex made every canonical tag point at a URL that redirects elsewhere, and
// left the OG image reachable only through that redirect — which some link
// scrapers refuse to follow for images.
//
// If the Vercel primary domain is ever flipped to the bare apex, change this
// line back to `https://masjidconnect.be` in the same deploy.
export const SITE_URL = 'https://www.masjidconnect.be'
