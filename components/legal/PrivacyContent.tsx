import { Shield, Users, Clock, FileCheck, Mail, Building2, Scale, Server } from 'lucide-react'
import { EntityFooter } from './EntityFooter'

const sections = [
  {
    icon: Building2,
    title: 'Wie is verantwoordelijk voor uw gegevens?',
    items: [
      'Uw school (de moskee) is de verwerkingsverantwoordelijke: zij bepaalt welke gegevens worden verwerkt en waarvoor.',
      'MasjidConnect is de verwerker: wij verwerken de gegevens enkel in opdracht van uw school, onder een verwerkersovereenkomst.',
      'Om uw rechten uit te oefenen richt u zich in de eerste plaats tot de beheerder van uw school.',
    ],
  },
  {
    icon: Shield,
    title: 'Welke gegevens bewaren wij?',
    items: [
      'Naam en voornaam',
      'E-mailadres en telefoonnummer (indien opgegeven)',
      'Klas- en groepsinschrijvingen',
      'Ingediende taken, scores, feedback en examenresultaten',
      'Aanwezigheidsregistraties en rapporten',
      'Wij verzamelen geen geboortedatum of gevoelige gegevens en doen niet aan reclame of profilering.',
    ],
  },
  {
    icon: Scale,
    title: 'Waarom en op welke basis?',
    items: [
      'Voor een goede schoolwerking: inschrijvingen, opvolging van taken en resultaten, aanwezigheden en communicatie.',
      'Juridische basis: de uitvoering van de schoolovereenkomst en het gerechtvaardigd belang van uw school (art. 6 AVG).',
      'Beperkte technische logs (bv. IP-adres) gebruiken wij enkel voor de beveiliging van het platform.',
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
    icon: Server,
    title: 'Externe partners (sub-verwerkers)',
    items: [
      'Voor hosting, e-mail en beveiliging doen wij een beroep op zorgvuldig geselecteerde partners (o.a. database-hosting, e-mailverzending en misbruikbeveiliging).',
      'Met elke partner bestaat een verwerkersovereenkomst. Waar gegevens buiten de EER worden verwerkt, gelden de modelcontractbepalingen (SCC) van de Europese Commissie.',
    ],
  },
  {
    icon: Clock,
    title: 'Hoe lang bewaren wij uw gegevens?',
    items: [
      'Uw gegevens worden bewaard zolang u ingeschreven bent bij de school.',
      'Na uitschrijving worden uw gegevens gearchiveerd en niet langer actief gebruikt.',
      'U kunt de beheerder verzoeken uw gegevens volledig te laten wissen (AVG art. 17 — recht op vergetelheid).',
    ],
  },
  {
    icon: FileCheck,
    title: 'Uw rechten (AVG/GDPR)',
    items: [
      'Recht op inzage: u kunt opvragen welke gegevens wij over u bewaren.',
      'Recht op verbetering: u kunt onjuiste gegevens laten aanpassen.',
      'Recht op wissen, beperking, overdraagbaarheid en bezwaar.',
      'Neem contact op met uw schoolbeheerder om een van deze rechten uit te oefenen.',
      'U kunt ook een klacht indienen bij de Gegevensbeschermingsautoriteit (GBA): www.gegevensbeschermingsautoriteit.be.',
    ],
  },
  {
    icon: Mail,
    title: 'Contact',
    items: [
      'Voor vragen of verzoeken over uw persoonsgegevens kunt u contact opnemen met de beheerder van uw school via de contactgegevens in het systeem.',
      'MasjidConnect verwerkt persoonsgegevens in overeenstemming met de Algemene Verordening Gegevensbescherming (AVG/GDPR) en de Belgische wet van 30 juli 2018.',
    ],
  },
]

export function PrivacyContent() {
  return (
    <>
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
    <EntityFooter />
    </>
  )
}
