import type { Metadata } from 'next'
import { LandingPageEn } from '@/components/marketing/LandingPageEn'
import { SITE_URL } from '@/lib/site'

// English page for international visitors. The app itself stays Dutch-only;
// this page says so rather than pretending otherwise.
export const metadata: Metadata = {
    title: { absolute: 'MasjidConnect — a school platform for mosque weekend schools' },
    description:
        'Attendance, homework, grades and bilingual Arabic/Dutch report cards for mosque weekend ' +
        'schools in Belgium. Multi-tenant, built on Next.js and Postgres row-level security.',
    alternates: {
        canonical: `${SITE_URL}/en`,
        languages: { 'nl-BE': SITE_URL, en: `${SITE_URL}/en` },
    },
    openGraph: {
        type: 'website',
        locale: 'en_GB',
        url: `${SITE_URL}/en`,
        siteName: 'MasjidConnect',
        title: 'MasjidConnect — a school platform for mosque weekend schools',
        description: 'Attendance, homework, grades and bilingual report cards in one app.',
        images: [{ url: '/og-image-en.png', width: 1200, height: 630, alt: 'MasjidConnect' }],
    },
    // Read by LinkedIn and some WhatsApp versions too (see app/page.tsx).
    twitter: {
        card: 'summary_large_image',
        title: 'MasjidConnect — a school platform for mosque weekend schools',
        description: 'Attendance, homework, grades and bilingual report cards in one app.',
        images: ['/og-image-en.png'],
    },
}

export default function EnglishHome() {
    return <LandingPageEn />
}
