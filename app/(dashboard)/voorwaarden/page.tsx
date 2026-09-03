'use client'

import { VoorwaardenContent } from '@/components/legal/VoorwaardenContent'
import { LEGAL_LAST_UPDATED } from '@/lib/terms'

export default function VoorwaardenPage() {
  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Gebruikersvoorwaarden</h1>
        <p className="page-subtitle">De regels voor het gebruik van MasjidConnect</p>
      </div>

      <VoorwaardenContent />

      <p className="text-xs text-gray-400 text-center mt-8">
        {LEGAL_LAST_UPDATED} · Samen met het privacybeleid vormen deze de Voorwaarden
      </p>
    </div>
  )
}
