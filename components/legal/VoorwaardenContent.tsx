'use client'

// In-app rendering of the Gebruikersovereenkomst (legal/gebruikersovereenkomst.md).
// Keep this in sync with that file when the Voorwaarden change, and bump
// CURRENT_TERMS_VERSION in lib/terms.ts.
// The legal entity is identified in the EntityFooter below; the full formal
// version (with address + court) lives in legal/gebruikersovereenkomst.md.
//
// v2, 2026-09-02 — legal review. What changed and why:
//   · The exoneration clauses were blanket and uncapped. Under Belgian law a
//     clause cannot exclude liability for one's own opzet or empty the contract
//     of substance (BW Boek 5, art. 5.89), and art. VI.91/4 WER blacklists the
//     unilateral-change and own-gross-fault clauses in a B2B contract. A struck
//     clause leaves UNLIMITED liability, so the blanket wording protected
//     nobody. Replaced with a real cap plus the mandatory carve-outs.
//   · The indemnity in art. 8 applied to pupils, i.e. to minors. Excluded.
//   · Nothing granted MasjidConnect the right to host and display the content
//     users add, and nothing said who owns teacher-made material. Added.
//   · No contact point and no notice-and-action route (DSA arts. 11/12/14 apply
//     to intermediaries whatever their size); no reference to the DPA that, by
//     its own art. 1.2, takes precedence over this agreement. Added as art. 11.
//   · Pupils are minors and cannot validly sign a contract — art. 1 now says
//     the school accepts on their behalf and they acknowledge the rules.

import { EntityFooter } from './EntityFooter'

type Block =
  | { p: string }
  | { list: string[] }
  | { note: string }

interface Section {
  title: string
  blocks: Block[]
}

const sections: Section[] = [
  {
    title: '1. Waarom deze Gebruikersovereenkomst',
    blocks: [
      { p: 'Als gebruiker wordt van jou verwacht dat je MasjidConnect volgens bepaalde regels gebruikt. Met deze Gebruikersovereenkomst informeren wij je over de plichten die op jou rusten. Samen met de Privacyverklaring vormen zij de "Voorwaarden".' },
      { p: 'In de meeste gevallen gebruik je MasjidConnect omwille van je verhouding met een school (de moskee). Die school is de licentienemer van MasjidConnect en aanvaardt deze Voorwaarden voor haar gebruikers; dat bepaalt ook de omvang van je gebruiksrechten.' },
      { note: 'Ben je leerling en nog minderjarig? Dan sluit je zelf geen contract met MasjidConnect — dat doet je school. Wij vragen je alleen te bevestigen dat je deze regels gelezen hebt, zodat je weet wat er van je verwacht wordt.' },
    ],
  },
  {
    title: '2. Een eigen gebruiksrecht',
    blocks: [
      { p: 'Iedere gebruiker krijgt een beperkt recht van toegang, gebruik en weergave van MasjidConnect. De omvang verschilt naargelang je rol (leerling, leerkracht, leerlingenbegeleiding of beheerder). Dit gebruiksrecht is een beperkte, herroepbare, niet-exclusieve en niet-overdraagbare licentie. Je mag MasjidConnect niet verkopen, herpubliceren, herverdelen, overdragen of in sublicentie geven.' },
      { p: 'Je mag inhoud toevoegen (zoals taken, lesmateriaal, aankondigingen, feedback). Voeg enkel inhoud toe waarover je de nodige rechten beschikt en volg de regels onder de artikelen 4, 5 en 9.' },
      { p: 'De inhoud die je toevoegt blijft van jou of van je school. Je geeft MasjidConnect enkel het recht om die inhoud op te slaan, weer te geven, te back-uppen en te tonen aan de gebruikers die er volgens hun rol toegang toe hebben — niet meer dan nodig is om de dienst te leveren. Wij gebruiken je inhoud niet voor andere doeleinden, verkopen ze niet en trainen er geen AI-modellen mee. Lesmateriaal dat een leerkracht maakt, blijft van de leerkracht of van de school volgens de afspraken die tussen hen gelden.' },
    ],
  },
  {
    title: '3. Na creatie van een gebruikersprofiel',
    blocks: [
      { p: 'Je krijgt pas toegang nadat de school een gebruikersprofiel voor je heeft aangemaakt (via uitnodiging). Controleer of je gegevens correct, waarheidsgetrouw, actueel en volledig zijn. Het blijft jouw verantwoordelijkheid om verouderde informatie te (laten) corrigeren.' },
      { p: 'Ieder gebruikersprofiel is strikt individueel, persoonlijk en vertrouwelijk en mag niet aan derden worden overgedragen. Je bent verantwoordelijk voor alle handelingen met je profiel en waakt over je inloggegevens. Meld elke inbreuk op de vertrouwelijkheid aan de school.' },
      { note: 'Het schenden van de vertrouwelijkheid van een gebruikersprofiel (zoals aanmatiging van naam, valsheid in informatica of identiteitsfraude) is strafrechtelijk sanctioneerbaar.' },
    ],
  },
  {
    title: '4. Beperkingen aan het gebruiksrecht',
    blocks: [
      { p: 'De volgende handelingen zijn verboden:' },
      { list: [
        'het gebruik van software voor geautomatiseerde gegevensverzameling (spiders, crawlers, keyloggers, robots e.d.);',
        'handelingen die andere gebruikers schade of hinder toebrengen, waaronder Denial-of-Service-aanvallen;',
        'gebruik voor spam, kettingbrieven, junkmail en gelijkaardige praktijken;',
        'het stalken van andere gebruikers;',
        'ongeautoriseerde toegang tot gebruikersprofielen van anderen;',
        'het gebruik van een valse identiteit bij registratie of aanmelding (inclusief via een open proxy).',
      ] },
      { p: 'Wanneer je inhoud toevoegt, is de volgende inhoud niet toegestaan:' },
      { list: [
        'onwettige, schadelijke, misleidende, bedreigende, beledigende, obscene, kinderpornografische, aanstootgevende of racistische inhoud, of inhoud in strijd met de openbare orde en goede zeden;',
        'schadelijke programmatuur (virussen, malware, worms, trojans e.d.);',
        'inhoud die de intellectuele rechten of portretrechten van anderen schendt;',
        'inhoud die aanspoort tot of verwijst naar strafbare feiten.',
      ] },
      { p: 'MasjidConnect verleent de nodige medewerking aan de school en aan de bevoegde instanties (o.a. de Federal Computer Crime Unit) om strafbare gedragingen vast te stellen en te vervolgen.' },
    ],
  },
  {
    title: '5. Hoe wij de applicatie aanbieden',
    blocks: [
      { p: 'MasjidConnect wordt aangeboden op een "as is" en "as available" basis. Wij spannen ons in om de dienst beschikbaar, correct en veilig te houden, maar wij garanderen geen ononderbroken werking en mogen de toegang beperken of onderbreken wanneer onderhoud of de veiligheid dat vereisen.' },
      { p: 'Inhoud wordt toegevoegd door MasjidConnect, door gebruikers en door geautoriseerde derden. Wij kunnen de juistheid van door gebruikers toegevoegde inhoud niet garanderen en zijn niet verplicht inhoud vooraf te controleren. Merk je inhoud op die de Voorwaarden of de wet schendt, meld dit dan volgens artikel 11.' },
      { p: 'Cookies en lokale opslag: MasjidConnect gebruikt geen tracking- of advertentiecookies en doet niet aan profilering. Voor de technische werking bewaren wij enkel een noodzakelijk sessietoken in de lokale opslag van je browser, zodat je aangemeld kan blijven. Er worden geen analytische cookies van derden geplaatst.' },
    ],
  },
  {
    title: '6. Downloads en externe links',
    blocks: [
      { p: 'MasjidConnect bevat inhoud die je kan downloaden (bv. lesmateriaal, rapporten). Elke download gebeurt op eigen risico; tref zelf de nodige beveiligingsmaatregelen. MasjidConnect kan links naar externe websites bevatten die buiten onze controle en Voorwaarden vallen — lees steeds de voorwaarden en privacyverklaringen van die websites.' },
    ],
  },
  {
    title: '7. Einde van het gebruiksrecht',
    blocks: [
      { p: 'Het gebruiksrecht geldt voor de duur bepaald door de verhouding tussen MasjidConnect en de school en tussen de school en jou. Zodra de school je account verwijdert of archiveert, eindigt je toegang automatisch.' },
      { p: 'Je kan je gebruik op elk moment stopzetten. Voor de verwijdering van je profiel richt je je tot de school. MasjidConnect mag redelijke maatregelen treffen (bv. schorsing) wanneer je de Voorwaarden schendt, indien nodig zonder voorafgaande waarschuwing.' },
      { p: 'Eindigt de overeenkomst met de school, dan krijgt de school de gelegenheid haar gegevens uit MasjidConnect te exporteren voordat die worden verwijderd. De bewaartermijnen staan in de Privacyverklaring.' },
    ],
  },
  {
    title: '8. Aansprakelijkheid',
    blocks: [
      { p: 'De aansprakelijkheid van MasjidConnect is beperkt tot de vergoedingen die de school in de twaalf maanden vóór het schadegeval heeft betaald, met een minimum van 1.000 euro. Wij zijn niet aansprakelijk voor indirecte schade of gevolgschade, zoals winstderving of verlies van gegevens die elders nog beschikbaar zijn.' },
      { p: 'Deze beperkingen gelden niet bij opzet, bedrog of zware fout van MasjidConnect, bij overlijden of lichamelijke letselschade, en evenmin waar dwingend recht een beperking van aansprakelijkheid niet toelaat. Zij doen geen afbreuk aan de aansprakelijkheidsregeling in de verwerkersovereenkomst met de school (art. 82 AVG).' },
      { p: 'Veroorzaak je door een ernstige, aan jou toerekenbare tekortkoming schade bij MasjidConnect, dan kan die op jou worden verhaald volgens het gemeen recht. Deze bepaling is niet van toepassing op minderjarige leerlingen.' },
    ],
  },
  {
    title: '9. Intellectuele eigendom',
    blocks: [
      { p: 'MasjidConnect en haar inhoud (software, teksten, beelden, vormgeving, handelsnamen) zijn beschermd door intellectuele eigendomsrechten. Je mag deze niet gebruiken of wijzigen zonder toestemming van de rechthebbende.' },
      { p: 'Wie inhoud toevoegt, staat in voor de naleving van de intellectuele eigendomsrechten daarop en verbindt zich ertoe geen rechten van derden te schenden. Schendingen kunnen niet aan MasjidConnect worden toegerekend.' },
    ],
  },
  {
    title: '10. Wijzigingen aan de dienst en aan deze Voorwaarden',
    blocks: [
      { p: 'MasjidConnect blijft de dienst verder ontwikkelen en mag functies toevoegen, wijzigen of vervangen. Wijzigingen die de dienst wezenlijk beperken, en de stopzetting van de dienst, kondigen wij vooraf aan bij de school, zodat zij tijdig kan reageren en haar gegevens kan exporteren.' },
      { p: 'Wijzigen wij deze Voorwaarden inhoudelijk, dan vragen wij je bij je volgende aanmelding om de nieuwe versie te lezen. De datum en het versienummer staan onderaan dit document.' },
      { p: 'Is een bepaling ongeldig, dan blijven de overige bepalingen gelden en wordt de ongeldige bepaling vervangen door een geldige bepaling die het beoogde doel zo dicht mogelijk benadert.' },
    ],
  },
  {
    title: '11. Meldingen, contact en voorrang',
    blocks: [
      { p: 'Merk je inhoud op die onwettig is of deze Voorwaarden schendt, meld dit dan bij de beheerder van je school. Lukt dat niet, of gaat het om de school zelf, dan kan je MasjidConnect rechtstreeks contacteren via ayman@masjidconnect.be. Wij bevestigen je melding, beoordelen ze en laten weten welk gevolg wij eraan geven.' },
      { p: 'Datzelfde adres is het contactpunt voor gebruikers en voor overheidsinstanties. Voor vragen en verzoeken over persoonsgegevens gebruik je privacy@masjidconnect.be.' },
      { p: 'Tussen MasjidConnect en de school geldt daarnaast een verwerkersovereenkomst. Bij tegenstrijdigheid over de verwerking van persoonsgegevens primeert die verwerkersovereenkomst op deze Gebruikersovereenkomst.' },
      { p: 'Deze Gebruikersovereenkomst wordt beheerst door het Belgische recht. Partijen streven bij geschillen eerst naar een minnelijke oplossing; bij gebrek daaraan zijn de bevoegde Belgische rechtbanken bevoegd.' },
    ],
  },
]

export function VoorwaardenContent() {
  return (
    <>
    <div className="space-y-5">
      {sections.map(({ title, blocks }) => (
        <div key={title} className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
          <div className="space-y-3">
            {blocks.map((block, idx) => {
              if ('p' in block) {
                return <p key={idx} className="text-sm text-gray-600 leading-relaxed">{block.p}</p>
              }
              if ('note' in block) {
                return (
                  <p key={idx} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {block.note}
                  </p>
                )
              }
              return (
                <ul key={idx} className="space-y-2">
                  {block.list.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )
            })}
          </div>
        </div>
      ))}
    </div>
    <EntityFooter />
    </>
  )
}
