'use client'

import { Shield, Users, Clock, FileCheck, Mail } from 'lucide-react'

const sections = [
  {
    icon: Shield,
    title: 'Welke gegevens bewaren wij?',
    items: [
      'Naam en voornaam',
      'E-mailadres',
      'Telefoonnummer (indien opgegeven)',
      'Klasinschrijvingen',
      'Ingediende taken en behaalde scores',
      'Aanwezigheidsregistraties',
    ],
  },
  {
    icon: Users,
    title: 'Wie heeft toegang?',
    items: [
      'Leerkrachten zien enkel de taken, scores en aanwezigheid van hun eigen leerlingen.',
      'Beheerders zien alle gegevens binnen hun school.',
      'Andere leerlingen hebben geen toegang tot uw persoonlijke gegevens.',
    ],
  },
  {
    icon: Clock,
    title: 'Hoe lang bewaren wij uw gegevens?',
    items: [
      'Uw gegevens worden bewaard zolang u ingeschreven bent bij de school.',
      'Na uitschrijving worden uw gegevens gearchiveerd en niet langer actief gebruikt.',
      'U kunt de beheerder verzoeken uw gegevens volledig te laten wissen (GDPR art. 17 — recht op vergetelheid).',
    ],
  },
  {
    icon: FileCheck,
    title: 'Uw rechten (AVG/GDPR)',
    items: [
      'Recht op inzage: u kunt opvragen welke gegevens wij over u bewaren.',
      'Recht op correctie: u kunt onjuiste gegevens laten aanpassen.',
      'Recht op wissen: u kunt verzoeken uw gegevens te laten verwijderen.',
      'Recht op bezwaar: u kunt bezwaar maken tegen de verwerking van uw gegevens.',
      'Neem contact op met uw schoolbeheerder om een van deze rechten uit te oefenen.',
    ],
  },
  {
    icon: Mail,
    title: 'Contact',
    items: [
      'Voor vragen of verzoeken over uw persoonsgegevens kunt u contact opnemen met de beheerder van uw school via de contactgegevens in het systeem.',
      'MasjidConnect verwerkt persoonsgegevens in overeenstemming met de Algemene Verordening Gegevensbescherming (AVG/GDPR).',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Privacybeleid</h1>
        <p className="page-subtitle">Hoe MasjidConnect uw gegevens verwerkt</p>
      </div>

      <div className="space-y-5">
        {sections.map(({ icon: Icon, title, items }) => (
          <div key={title} className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-primary-600" />
              </div>
              <h2 className="font-semibold text-gray-900">{title}</h2>
            </div>
            <ul className="space-y-2">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-8">
        Laatste update: mei 2026 · MasjidConnect voldoet aan de AVG/GDPR
      </p>
    </div>
  )
}
