import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// The three public URLs. Everything else is behind a login and is excluded in
// robots.ts, so this list is the whole indexable site — it is short by design,
// not incomplete.
export default function sitemap(): MetadataRoute.Sitemap {
    // Static build timestamp: these pages change only when the copy is edited
    // and redeployed, so the build time is exactly the right lastModified.
    const lastModified = new Date()

    return [
        { url: SITE_URL, lastModified, changeFrequency: 'monthly', priority: 1 },
        { url: `${SITE_URL}/legal/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
        { url: `${SITE_URL}/legal/voorwaarden`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    ]
}
