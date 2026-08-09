import type { Metadata } from 'next'
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
                <h1 className="page-title">Gebruikersvoorwaarden</h1>
                <p className="page-subtitle">De regels voor het gebruik van MasjidConnect</p>
            </div>

            <VoorwaardenContent />

            <p className="mt-8 text-center text-xs text-gray-400">
                Laatste update: juni 2026 · Samen met het privacybeleid vormen deze de Voorwaarden
            </p>
        </div>
    )
}
