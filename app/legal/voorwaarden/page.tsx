import type { Metadata } from 'next'
import { LEGAL_LAST_UPDATED } from '@/lib/terms'
import { VoorwaardenContent } from '@/components/legal/VoorwaardenContent'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
    title: 'Gebruiksvoorwaarden',
    description: 'De gebruikersovereenkomst voor het MasjidConnect-schoolplatform.',
    alternates: { canonical: `${SITE_URL}/legal/voorwaarden` },
}

export default function PublicVoorwaardenPage() {
    return (
        <div className="animate-slide-up">
            <div className="page-header">
                <h1 className="page-title">Gebruiksvoorwaarden</h1>
                <p className="page-subtitle">De regels voor het gebruik van MasjidConnect</p>
            </div>

            <VoorwaardenContent />

            <p className="mt-8 text-center text-xs text-gray-400">
                {LEGAL_LAST_UPDATED} · Samen met de privacyverklaring vormen deze de Voorwaarden
            </p>
        </div>
    )
}
