import type { Metadata } from 'next'
import { LandingPage } from '@/components/marketing/LandingPage'
import { RedirectIfAuthed } from '@/components/marketing/RedirectIfAuthed'
import { SITE_URL } from '@/lib/site'

// `/` is the public one-pager. Signed-in visitors are bounced to /dashboard by
// the client island below, so the bookmarked root URL keeps working for the
// schools already using the platform.
export const metadata: Metadata = {
    // Overrides the layout's "%s — MasjidConnect" template: the landing page
    // owns the whole title string.
    title: {
        absolute: 'MasjidConnect — het schoolplatform voor moskeescholen',
    },
    description:
        'Alles voor uw weekendschool in één app: klassen, huiswerk, punten, aanwezigheden, ' +
        'tweetalige rapporten, dossiers en lidgeld. Gebouwd voor Arabische en islamitische ' +
        'scholen in België. Gegevens in de EU.',
    alternates: { canonical: SITE_URL },
    openGraph: {
        type: 'website',
        locale: 'nl_BE',
        url: SITE_URL,
        siteName: 'MasjidConnect',
        title: 'MasjidConnect — het schoolplatform voor moskeescholen',
        description:
            'Klassen, huiswerk, punten, aanwezigheden en tweetalige rapporten in één app. ' +
            'Voor Arabische en islamitische scholen in België.',
        // Committed static PNG rather than a generated next/og route — see the
        // header of scripts/make-og-image.mjs, which regenerates it.
        // metadataBase turns this into an absolute URL, which scrapers require.
        images: [{
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: 'MasjidConnect — alles voor uw weekendschool in één app.',
        }],
    },
    twitter: {
        // Not for Twitter itself — several link-preview scrapers (LinkedIn,
        // some WhatsApp versions) read the twitter:* tags when they exist and
        // fall back to a small thumbnail without the summary_large_image hint.
        card: 'summary_large_image',
        title: 'MasjidConnect — het schoolplatform voor moskeescholen',
        description:
            'Klassen, huiswerk, punten, aanwezigheden en tweetalige rapporten in één app.',
        images: ['/og-image.png'],
    },
}

// Structured data so a search result shows the product, not just a blue link.
// Contact-only by design — no `offers`, because there is no public price and no
// self-service signup to send anyone to.
const JSON_LD = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MasjidConnect',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    inLanguage: 'nl-BE',
    url: SITE_URL,
    description:
        'Schoolplatform voor moskeescholen en weekendscholen: klassen, huiswerk, punten, ' +
        'aanwezigheden, tweetalige rapporten, leerlingendossiers en lidgeld.',
    audience: {
        '@type': 'Audience',
        audienceType: 'Arabische en islamitische scholen in België',
    },
    provider: {
        '@type': 'Organization',
        name: 'MasjidConnect',
        legalName: 'Ayman Boulayoune',
        vatID: 'BE1034397409',
        url: SITE_URL,
        email: 'ayman@masjidconnect.be',
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'Antwerpen',
            addressCountry: 'BE',
        },
    },
}

export default function RootPage() {
    return (
        <>
            <RedirectIfAuthed />
            <LandingPage />
            <script
                type="application/ld+json"
                // Static object literal, no user input — nothing here can be
                // attacker-controlled.
                dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
            />
        </>
    )
}
