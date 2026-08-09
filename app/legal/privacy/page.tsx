import type { Metadata } from 'next'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
    title: 'Privacyverklaring',
    description: 'Hoe MasjidConnect persoonsgegevens van leerlingen, ouders en personeel verwerkt.',
    alternates: { canonical: `${SITE_URL}/legal/privacy` },
}

export default function PublicPrivacyPage() {
    return (
        <div className="animate-slide-up">
            <div className="page-header">
                <h1 className="page-title">Privacybeleid</h1>
                <p className="page-subtitle">Hoe MasjidConnect uw gegevens verwerkt</p>
            </div>

            <PrivacyContent />

            <p className="mt-8 text-center text-xs text-gray-400">
                Laatste update: juni 2026 · MasjidConnect voldoet aan de AVG/GDPR
            </p>
        </div>
    )
}
