import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Only `/` and `/legal/*` are public. Everything else is the application itself:
// it carries no data for a crawler (sessions live in localStorage, so a bot only
// ever sees the login shell) and indexing those URLs would put "Inloggen" pages
// in the search results next to the landing page.
//
// Written as an explicit disallow list rather than "Disallow: / + Allow: /$",
// because the `$` anchor is a Google/Bing extension: a crawler that ignores it
// would drop the marketing page from the index entirely. A private route that is
// ever forgotten here just gets crawled to a login screen — no data leaks.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            disallow: [
                '/api/',
                '/login',
                '/akkoord',
                '/forgot-password',
                '/reset-password',
                '/dashboard',
                '/aanwezigheid',
                '/agenda',
                '/beheer',
                '/betalingen',
                '/dossiers',
                '/huiswerk',
                '/klassen',
                '/lesmodules',
                '/oudercontact',
                '/rapporten',
                '/rooster',
                '/superadmin',
                // The login-gated in-app copies of the legal pages. The public
                // /legal/* mirrors render the same components and stay indexable,
                // so this only prevents a duplicate-content pair.
                '/privacy',
                '/voorwaarden',
            ],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    }
}
