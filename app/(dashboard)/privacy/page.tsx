'use client'

import { PrivacyContent } from '@/components/legal/PrivacyContent'

export default function PrivacyPage() {
  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Privacybeleid</h1>
        <p className="page-subtitle">Hoe MasjidConnect uw gegevens verwerkt</p>
      </div>

      <PrivacyContent />

      <p className="text-xs text-gray-400 text-center mt-8">
        Laatste update: juni 2026 · MasjidConnect voldoet aan de AVG/GDPR
      </p>
    </div>
  )
}
