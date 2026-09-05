// Client boundary: lucide-react ships forwardRef icons without a 'use client'
// directive, so this can't render inside a server component. Marked explicitly
// now that the public /legal pages render it from a server page.
'use client'

// Rendered by BOTH the public /legal/privacy page and the in-app /privacy page,
// and by the /akkoord acceptance gate — one text, three places, so it can never
// drift. Any change here is a change to a published legal document: bump
// CURRENT_TERMS_VERSION in lib/terms.ts and keep legal/privacyverklaring.md
// (the long formal version) in step.
//
// v2, 2026-09-02 — legal review. What changed and why:
//   · MasjidConnect's own controller role (website + demo form) was missing
//     entirely; the page opened by telling every reader their school was the
//     controller, which is wrong for a prospect filling in the demo form.
//   · No retention periods (Art. 13(2)(a)), no source disclosure (Art. 14),
//     no consent withdrawal (Art. 13(2)(c)), no consequences of not providing
//     data (Art. 13(2)(e)), no route to a copy of the transfer safeguards
//     (Art. 13(1)(f)), sub-processors unnamed (Art. 13(1)(e)).
//   · "Wie heeft toegang" listed three of the five roles: leerlingenbegeleiding
//     and MasjidConnect's own technical account were undisclosed.
//   · "Profielfoto" was disclosed but never collected (dropped in migration 27).
//   · Nothing was addressed to a child, though children are the main data
//     subjects — Art. 12(1) asks for plain language in exactly that case.
//
// v2 amended in place, 2026-09-05 — the pupil's home address was dropped from
// the product (migration 28) after the school confirmed it was unused, so it is
// gone from this list too, and the purposes for the two fields that stayed
// (geboortedatum, geslacht) are now stated rather than assumed. Edited in place
// rather than bumped to v3 because no profile had accepted v2 yet.

import { Shield, Users, Clock, FileCheck, Mail, Building2, Scale, Server, Globe, Database } from 'lucide-react'
import { EntityFooter } from './EntityFooter'

const PRIVACY_MAIL = (
  <a href="mailto:privacy@masjidconnect.be" className="font-medium text-primary-600 hover:underline">
    privacy@masjidconnect.be
  </a>
)

const sections: { icon: typeof Shield; title: string; items: React.ReactNode[] }[] = [
  {
    icon: Building2,
    title: 'Wie is verantwoordelijk voor uw gegevens?',
    items: [
      'Uw school (de moskee) is de verwerkingsverantwoordelijke: zij bepaalt welke gegevens worden verwerkt en waarvoor.',
      'MasjidConnect is de verwerker: wij verwerken die gegevens enkel in opdracht van uw school, onder een verwerkersovereenkomst.',
      <>Voor een beperkt aantal verwerkingen is MasjidConnect zélf verantwoordelijke: bezoekers van
        deze website en demo-aanvragen, vragen die u rechtstreeks aan ons stelt, technische
        ondersteuning en de beveiliging van het platform. Zie “Bezoekers van deze website”.</>,
      <>Om uw rechten uit te oefenen richt u zich in de eerste plaats tot de beheerder van uw school.
        Krijgt u binnen een maand geen antwoord, mail dan {PRIVACY_MAIL} — wij bezorgen uw verzoek
        aan de school en volgen het op.</>,
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
      'Leerlingendossier: geboortedatum, geslacht, contactgegevens van de ouder(s) en noodcontact, familieverband, notities en documenten die de school toevoegt.',
      'Zorg- of gezondheidsinformatie (bijzondere categorieën, art. 9 AVG) verwerken wij enkel wanneer de school die toevoegt met de uitdrukkelijke toestemming van de ouder(s).',
      'Betalingen van lidgeld of bijdragen, wanneer de school die in MasjidConnect opvolgt.',
      'Beperkte technische logs (bv. IP-adres) voor de beveiliging van het platform.',
      'Wij doen niet aan reclame of profilering, nemen geen geautomatiseerde beslissingen over u, en gebruiken uw gegevens niet om AI-modellen te trainen.',
    ],
  },
  {
    icon: Database,
    title: 'Waar komen die gegevens vandaan?',
    items: [
      'Het grootste deel krijgen wij van uw school: zij voert de inschrijvingsgegevens en het dossier in, meestal op basis van wat de ouders bij inschrijving hebben opgegeven.',
      'Een deel komt van uzelf: wat u invult in uw profiel of indient als taak.',
      'Een deel komt van uw leerkrachten: scores, feedback, aanwezigheden en notities over de opvolging.',
      'Wij kopen geen gegevens aan en vullen uw dossier niet aan met gegevens uit andere bronnen.',
    ],
  },
  {
    icon: Scale,
    title: 'Waarom en op welke basis?',
    items: [
      'Voor een goede schoolwerking: inschrijvingen, opvolging van taken en resultaten, aanwezigheden en communicatie.',
      'Juridische basis: de uitvoering van de overeenkomst tussen de school en de ouders, en het gerechtvaardigd belang van uw school bij haar onderwijsopdracht (art. 6 AVG).',
      'Voor zorg- en gezondheidsgegevens geldt een strengere regel: die verwerken wij alleen op grond van de uitdrukkelijke toestemming van de ouder(s) (art. 9 AVG). Die toestemming kunt u op elk moment intrekken bij de school; wat daarvóór gebeurde blijft rechtmatig, maar wij stoppen dan met verdere verwerking en verwijderen de betrokken documenten.',
      'Technische logs verwerken wij op grond van ons gerechtvaardigd belang bij een veilig platform.',
      'Sommige gegevens zijn noodzakelijk: zonder naam, klas en een contactgegeven kan de school een leerling niet inschrijven of opvolgen. Het dossier is grotendeels optioneel — de school bepaalt wat zij nodig heeft.',
      'Twee dossiergegevens verdienen uitleg, omdat wij ze bewust bijhouden: de geboortedatum bepaalt in welke leeftijdsgroep een leerling hoort en is nodig voor activiteiten met een leeftijdsgrens, en het geslacht gebruikt de school om activiteiten voor jongens en meisjes apart te organiseren.',
      'Het adres van de leerling bewaren wij niet langer. Het werd niet gebruikt en is in september 2026 uit het systeem verwijderd.',
    ],
  },
  {
    icon: Users,
    title: 'Wie heeft toegang?',
    items: [
      'Leerkrachten zien de taken, scores en aanwezigheid van hun eigen leerlingen.',
      'Leerlingenbegeleiding ziet, over alle klassen heen, de dossiers en aanwezigheden van álle leerlingen van de school, en kan notities en documenten toevoegen. Die brede toegang hoort bij de begeleidingsopdracht; uw school beslist wie deze rol krijgt.',
      'Beheerders zien alle gegevens binnen hun eigen school.',
      'Andere leerlingen hebben geen toegang tot uw persoonlijke gegevens.',
      'Scholen zien nooit elkaars gegevens. Die scheiding is niet alleen een schermregel: de database zelf weigert toegang tot gegevens van een andere school.',
      'MasjidConnect beschikt over één technisch beheerdersaccount, nodig voor onderhoud, ondersteuning en het aanmaken van nieuwe scholen. Wij gebruiken het alleen wanneer dat nodig is om de dienst te leveren of wanneer uw school ons daarom vraagt.',
    ],
  },
  {
    icon: Server,
    title: 'Externe partners (sub-verwerkers)',
    items: [
      'Supabase — database, aanmelding en bestandsopslag. Gehost op AWS in de EU-regio Ierland (eu-west-1).',
      'Vercel — hosting van de webtoepassing.',
      'Resend — verzending van e-mails zoals uitnodigingen en wachtwoordherstel, via Amazon SES in Ierland.',
      'Upstash — beveiliging tegen misbruik (het afremmen van te veel opeenvolgende aanvragen).',
      'Met elke partner gelden verwerkersafspraken op basis van hun verwerkersovereenkomst. Enkele van deze leveranciers hebben hun moederentiteit in de Verenigde Staten; voor zover daarbij toegang van buiten de EER mogelijk is, steunt die doorgifte op de modelcontractbepalingen (SCC) van de Europese Commissie.',
      <>Een kopie van de doorgiftewaarborgen en de actuele lijst van sub-verwerkers kunt u
        opvragen via {PRIVACY_MAIL}. Nieuwe of vervangen sub-verwerkers melden wij vooraf aan de
        school, zodat zij bezwaar kan maken.</>,
    ],
  },
  {
    icon: Clock,
    title: 'Hoe lang bewaren wij uw gegevens?',
    items: [
      'Uw gegevens worden bewaard zolang u ingeschreven bent bij de school.',
      'Na uitschrijving verwijderen wij het dossier — adres, contactgegevens, notities en documenten — binnen 12 maanden.',
      'Onderwijsresultaten (scores, rapporten, aanwezigheden) bewaren wij tot 2 jaar na uitschrijving en anonimiseren wij daarna, zodat er enkel cijfers zonder namen overblijven.',
      'Betalingsgegevens moeten wij 7 jaar bijhouden: dat is een wettelijke boekhoudkundige verplichting, en die gegevens kunnen daarom niet eerder gewist worden.',
      'Technische logs bewaren wij maximaal 12 maanden.',
      'Uw school kan kortere termijnen opleggen: zij is de verantwoordelijke en haar instructie gaat voor.',
      'U kunt de beheerder altijd verzoeken uw gegevens eerder te laten wissen (AVG art. 17 — recht op vergetelheid).',
    ],
  },
  {
    icon: FileCheck,
    title: 'Uw rechten (AVG/GDPR)',
    items: [
      'Recht op inzage: u kunt opvragen welke gegevens wij over u bewaren, en daarvan gratis een kopie krijgen.',
      'Recht op verbetering: u kunt onjuiste of onvolledige gegevens laten aanpassen.',
      'Recht op wissen, beperking, overdraagbaarheid en bezwaar.',
      'Recht om uw toestemming in te trekken, daar waar wij op toestemming steunen (zorg- en gezondheidsgegevens).',
      'Ouders of voogden oefenen deze rechten uit voor een minderjarig kind. Naarmate een leerling ouder wordt, kan hij of zij dat — in overleg met de school — ook zelf.',
      <>Neem contact op met uw schoolbeheerder om een recht uit te oefenen. U krijgt binnen een
        maand antwoord. Blijft dat uit, mail dan {PRIVACY_MAIL}.</>,
      <>U kunt ook een klacht indienen bij de Gegevensbeschermingsautoriteit (GBA),{' '}
        <a href="https://www.gegevensbeschermingsautoriteit.be" target="_blank" rel="noopener noreferrer"
           className="font-medium text-primary-600 hover:underline">gegevensbeschermingsautoriteit.be</a>.</>,
    ],
  },
  {
    icon: Globe,
    title: 'Bezoekers van deze website',
    items: [
      'Voor deze website is MasjidConnect zelf de verwerkingsverantwoordelijke — niet een school.',
      'Vraagt u een demo aan, dan verwerken wij uw naam, uw school of moskee, uw e-mailadres, uw telefoonnummer (optioneel) en uw bericht. Wij gebruiken die uitsluitend om op uw aanvraag te antwoorden, op grond van ons gerechtvaardigd belang en uw voorbereiding van een mogelijke overeenkomst.',
      'Uw aanvraag komt als e-mail bij ons terecht; wij slaan ze niet op in een aparte databank. Wij bewaren die e-mail maximaal 12 maanden, tenzij er een klantrelatie uit voortkomt.',
      'Bij het versturen van het formulier verwerken wij tijdelijk uw IP-adres om misbruik en spam tegen te gaan.',
      'Deze website gebruikt geen tracking-, analyse- of advertentiecookies, en wij meten uw bezoek niet. Na het inloggen bewaren wij enkel een technisch noodzakelijk sessietoken in uw browser, zodat u aangemeld blijft. Daarom is er ook geen cookiebanner: er valt niets te aanvaarden of te weigeren.',
      <>Wilt u weten welke gegevens wij over u als bezoeker hebben, of wilt u ze laten wissen?
        Mail {PRIVACY_MAIL}.</>,
    ],
  },
  {
    icon: Mail,
    title: 'Contact',
    items: [
      'Voor vragen of verzoeken over uw persoonsgegevens neemt u contact op met de beheerder van uw school via de contactgegevens in het systeem.',
      <>Voor vragen aan MasjidConnect zelf, of wanneer uw school niet reageert: {PRIVACY_MAIL}.</>,
      'MasjidConnect verwerkt persoonsgegevens in overeenstemming met de Algemene Verordening Gegevensbescherming (AVG/GDPR) en de Belgische wet van 30 juli 2018.',
    ],
  },
]

export function PrivacyContent() {
  return (
    <>
    <div className="space-y-5">
      {/* Art. 12(1) AVG asks for plain language "in particular" where the
          information is addressed to a child — and children are the main data
          subjects here. This is the whole statement in six lines. */}
      <div className="card border-primary-100 bg-primary-50/40 p-6">
        <h2 className="font-semibold text-gray-900 mb-3">In het kort — ook voor leerlingen</h2>
        <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
          <li>· Je school bewaart in MasjidConnect wie je bent, in welke klas je zit, wat je indient, welke punten je haalt en of je aanwezig was.</li>
          <li>· Je leerkrachten en de mensen die je school daarvoor aanduidt kunnen dat zien. Andere leerlingen niet, en andere scholen ook niet.</li>
          <li>· Wij verkopen niets van jou, tonen je geen reclame, en gebruiken je gegevens niet om computers te trainen.</li>
          <li>· Klopt er iets niet, of wil je weten wat er over jou bewaard wordt? Vraag het aan je schoolbeheerder — samen met je ouders als je nog minderjarig bent.</li>
        </ul>
      </div>

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
                <span>{item}</span>
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
