// In-app rendering of the Gebruikersovereenkomst (legal/gebruikersovereenkomst.md).
// Keep this in sync with that file when the Voorwaarden change, and bump
// CURRENT_TERMS_VERSION in lib/terms.ts.
//
// TODO (vóór live-gang): vul de juridische entiteit van MasjidConnect in
// (rechtsvorm, adres, KBO/BTW) en de bevoegde rechtbank. Tot dan toont de UI
// een generieke omschrijving zonder verzonnen gegevens.

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
      { p: 'Je bent een gebruiker zodra je toegang krijgt tot je gebruikersprofiel en telkens je MasjidConnect gebruikt. Door MasjidConnect te gebruiken, erken en aanvaard je dat de Voorwaarden van toepassing zijn.' },
      { p: 'In de meeste gevallen gebruik je MasjidConnect omwille van je verhouding met een school (de moskee). Deze school is de licentienemer van MasjidConnect, wat bepalend is voor je gebruiksrechten.' },
    ],
  },
  {
    title: '2. Een eigen gebruiksrecht',
    blocks: [
      { p: 'Iedere gebruiker krijgt een beperkt recht van toegang, gebruik en weergave van MasjidConnect. De omvang verschilt naargelang je rol (leerling, leerkracht of beheerder). Dit gebruiksrecht is een beperkte, herroepbare, niet-exclusieve en niet-overdraagbare licentie. Je mag MasjidConnect niet verkopen, herpubliceren, herverdelen, overdragen of in sublicentie geven.' },
      { p: 'Je mag inhoud toevoegen (zoals taken, lesmateriaal, aankondigingen, feedback). Voeg enkel inhoud toe waarover je de nodige rechten beschikt en volg de regels onder de artikelen 4, 5 en 9.' },
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
      { p: 'Ieder gebruik gebeurt op eigen risico. MasjidConnect wordt aangeboden op een "as is" en "as available" basis, zonder impliciete of expliciete garantie, en is binnen de grenzen van de wet niet aansprakelijk voor schade door storingen, onderbrekingen of defecten. Wij mogen de toegang beperken of onderbreken wanneer de omstandigheden dit verantwoorden.' },
      { p: 'Inhoud wordt toegevoegd door MasjidConnect, door gebruikers en door geautoriseerde derden. Wij kunnen de juistheid van door gebruikers toegevoegde inhoud niet garanderen en zijn niet verplicht inhoud vooraf te controleren. Merk je inhoud op die de Voorwaarden of de wet schendt, meld dit dan aan de school of, indien onbereikbaar, aan MasjidConnect.' },
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
    ],
  },
  {
    title: '8. Aansprakelijkheid en vrijwaring',
    blocks: [
      { p: 'Indien je door een aan jou toerekenbare tekortkoming schade, verlies of kosten bij MasjidConnect veroorzaakt of haar aansprakelijkheid in het gedrang brengt, vrijwaar je MasjidConnect voor die nadelige gevolgen.' },
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
    title: '10. Algemene bepalingen',
    blocks: [
      { p: 'MasjidConnect mag de dienst te allen tijde wijzigen, uitbreiden, beperken of tijdelijk stopzetten, zonder voorafgaande kennisgeving en zonder recht op schadevergoeding. Is een bepaling ongeldig, dan blijven de overige bepalingen gelden.' },
      { p: 'Deze Gebruikersovereenkomst wordt beheerst door het Belgische recht. Partijen streven bij geschillen eerst naar een minnelijke oplossing; bij gebrek daaraan zijn de bevoegde Belgische rechtbanken bevoegd.' },
    ],
  },
]

export function VoorwaardenContent() {
  return (
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
  )
}
