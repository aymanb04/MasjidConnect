// "Hoe doe ik…?" — the help content. ONE source for the in-app Hulp page and
// the printed guides (.claude/skills/run-app/make-hulpgids.ts), so the two can
// never say different things.
//
// Every button name is copied from the screen (checked 2026-10-31 as admin,
// teacher and pupil on the demo tenant). When a label in the app changes,
// change it here too: a guide that names a button that no longer exists is
// worse than no guide.
//
// `letOp` is the point of this file: what people get wrong or miss. Each one
// is real behaviour of the app, not general advice.

export type HelpAudience = 'teacher' | 'admin' | 'student'

export interface HelpArticle {
  id: string
  title: string
  category: string
  /** Who it is for. Admins also see the teacher articles. */
  for: HelpAudience[]
  intro?: string
  steps?: string[]
  letOp?: string[]
  /** "Als het niet lukt" */
  lukt?: string[]
  /** Extra words people might search for. */
  keywords?: string
}

export const AUDIENCE_LABEL: Record<HelpAudience, string> = {
  teacher: 'Leerkrachten',
  admin: 'Bestuur',
  student: 'Leerlingen en ouders',
}

export const HELP_CATEGORIES = [
  'Aan de slag',
  'Huiswerk',
  'Aanwezigheid',
  'Punten',
  'Rapport',
  'Lesmateriaal en communicatie',
  'Klassen en gebruikers',
  'De school inrichten',
  'Voor leerlingen en ouders',
] as const

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Aan de slag ─────────────────────────────────────────────────────────
  {
    id: 'aanmelden', category: 'Aan de slag', for: ['teacher', 'admin', 'student'],
    title: 'Aanmelden',
    intro: 'De school maakt je account aan. Je krijgt een e-mailadres en een startwachtwoord.',
    steps: [
      'Ga naar masjidconnect.be en klik op Inloggen.',
      'Vul het e-mailadres in dat je van de school kreeg, en het wachtwoord.',
      'Klik op Inloggen.',
      'De eerste keer vraagt de app je de gebruiksvoorwaarden en de privacyverklaring te aanvaarden. Vink aan dat je ze gelezen hebt en klik op "Akkoord en doorgaan" (bij een leerling heet de knop "Gelezen en doorgaan").',
      'Heb je een startwachtwoord gekregen, dan vraagt de app daarna om je eigen wachtwoord te kiezen. Zie "Je eigen wachtwoord kiezen".',
    ],
    letOp: [
      'Neem het wachtwoord letterlijk over, ook de hoofdletters. "Abc" en "abc" zijn niet hetzelfde.',
      'Typ geen spatie voor of na je e-mailadres.',
    ],
    lukt: [
      'Zie je "Ongeldig e-mailadres of wachtwoord", kijk dan beide nog eens na. Lukt het nog niet, zie "Wachtwoord vergeten".',
    ],
    keywords: 'inloggen login account starten begin',
  },
  {
    id: 'eigen-wachtwoord', category: 'Aan de slag', for: ['teacher', 'admin', 'student'],
    title: 'Je eigen wachtwoord kiezen of wijzigen',
    steps: [
      'De eerste keer met een startwachtwoord: de app toont "Kies je eigen wachtwoord". Vul het wachtwoord in dat je kreeg, daarna twee keer je nieuwe, en klik op Wachtwoord opslaan.',
      'Later wijzigen: klik linksonder in het menu op Wachtwoord. Vul je huidige wachtwoord in en twee keer het nieuwe, en klik op Opslaan.',
    ],
    letOp: [
      'Een wachtwoord moet minstens 8 tekens hebben, met een hoofdletter, een kleine letter en een cijfer.',
      'Kies iets anders dan het wachtwoord dat je kreeg. Het startwachtwoord stond op papier.',
      'Deel je wachtwoord met niemand, ook niet met een collega of een ander kind.',
    ],
    keywords: 'paswoord password veranderen wijzigen nieuw',
  },
  {
    id: 'wachtwoord-vergeten', category: 'Aan de slag', for: ['teacher', 'admin', 'student'],
    title: 'Wachtwoord vergeten',
    steps: [
      'Klik op het aanmeldscherm op "Reset via e-mail".',
      'Vul je e-mailadres in en klik op Reset link versturen.',
      'Open de mail en klik op de link. Kies een nieuw wachtwoord.',
    ],
    letOp: [
      'Een leerkracht kan geen wachtwoord opnieuw instellen. Alleen het bestuur kan dat.',
    ],
    lukt: [
      'Geen mail gekregen? Kijk in je spam. Nog niets, of heb je geen mailbox op dat adres: vraag het bestuur om een nieuw wachtwoord.',
    ],
    keywords: 'paswoord kwijt reset vergeten link mail',
  },
  {
    id: 'telefoon', category: 'Aan de slag', for: ['teacher', 'admin', 'student'],
    title: 'De app op je telefoon zetten',
    intro: 'MasjidConnect is een website, maar je kan hem als een app op je beginscherm zetten. Je hebt wel altijd internet nodig.',
    steps: [
      'iPhone: open masjidconnect.be in Safari, tik op het deelicoon en kies "Zet op beginscherm".',
      'Android: open masjidconnect.be in Chrome, tik op de drie puntjes en kies "App installeren" of "Toevoegen aan startscherm".',
    ],
    keywords: 'gsm smartphone installeren icoon beginscherm',
  },
  {
    id: 'klas-niet-zichtbaar', category: 'Aan de slag', for: ['teacher'],
    title: 'Ik zie een klas of een leerling niet',
    intro: 'Je ziet alleen de klassen waaraan het bestuur je gekoppeld heeft, en daarin alleen de leerlingen die in die klas zitten.',
    steps: [
      'Kijk onder Klassen welke klassen je hebt.',
      'Mist er een klas of een leerling, geef het door aan het bestuur. Zeg welke groep en welk vak.',
    ],
    letOp: [
      'Je kan zelf geen leerling of klas toevoegen.',
      'Niet elke leerling volgt elk vak. Een leerling die in Arabisch zit, zit niet vanzelf ook in Koran.',
    ],
    keywords: 'ontbreekt mist leerling klas weg niet gekoppeld',
  },

  // ── Huiswerk ────────────────────────────────────────────────────────────
  {
    id: 'huiswerk-maken', category: 'Huiswerk', for: ['teacher'],
    title: 'Huiswerk klaarzetten',
    steps: [
      'Ga naar Huiswerk en klik op Nieuw huiswerk.',
      'Kies de klas en geef een titel, bijvoorbeeld "Herhaling soera Al-Fatiha". Extra uitleg zet je bij Beschrijving.',
      'Voor wie: Hele klas, of Per leerling als niet iedereen hetzelfde moet doen. Bij Per leerling vink je de leerlingen aan en vul je per leerling de opdracht in.',
      'Zet een Deadline en de Max punten, bijvoorbeeld 10 of 20.',
      'Inleveren via de app? Kies "Ja, leerlingen uploaden" als ze iets moeten indienen (Bestand, Tekst of allebei). Kies "Nee, op papier of mondeling" voor werk dat in de klas gebeurt.',
      'Laat "Onmiddellijk publiceren" aan als de leerlingen het meteen mogen zien. Klik op Aanmaken.',
    ],
    letOp: [
      '"Inleveren via de app?" staat standaard op Nee. Moeten de leerlingen iets uploaden, zet het dan op Ja, anders kunnen ze niets indienen.',
      'Laat je Max punten leeg, dan heeft het huiswerk geen score en telt het nergens mee: niet in het gemiddelde en niet op het rapport.',
      'Zet je "Onmiddellijk publiceren" uit, dan blijft het een Concept. De leerlingen zien het pas als je het publiceert (zie "Huiswerk aanpassen").',
      'Huiswerk op papier of mondeling is nooit "te laat". Je geeft er gewoon punten op.',
    ],
    keywords: 'opdracht taak nieuw aanmaken deadline papier mondeling uploaden per leerling',
  },
  {
    id: 'huiswerk-bewerken', category: 'Huiswerk', for: ['teacher'],
    title: 'Huiswerk aanpassen, publiceren of verwijderen',
    steps: [
      'Open het huiswerk via Huiswerk of via de klas.',
      'Klik op Bewerken. Je kan de titel, de deadline, de punten en "Voor wie" aanpassen.',
      'Een concept publiceren: zet Gepubliceerd aan en sla op.',
      'Verwijderen: klik op Verwijderen en bevestig.',
    ],
    letOp: [
      'Verwijder je huiswerk waar al punten op staan, dan verdwijnen die punten ook uit het gemiddelde en het rapport.',
      'Zet je een opdracht voor de hele klas om naar Per leerling, kijk dan na wie je aangevinkt hebt: wie je uitvinkt, ziet de opdracht niet meer.',
    ],
    keywords: 'wijzigen deadline verlengen concept publiceren verwijderen',
  },
  {
    id: 'verbeteren', category: 'Huiswerk', for: ['teacher'],
    title: 'Huiswerk verbeteren en punten geven',
    steps: [
      'Open het huiswerk. Je ziet per leerling: Ingediend, Te laat ingediend, Niets ingediend of Beoordeeld.',
      'Klik op een leerling om te zien wat hij indiende.',
      'Vul de Punten in en, als je wil, een Commentaar voor de leerling.',
      'Klik op Punten opslaan. De leerling en zijn ouders zien het meteen.',
    ],
    letOp: [
      'Je kan ook punten geven aan een leerling die niets indiende, bijvoorbeeld voor werk op papier, of een 0 als het niet gemaakt is.',
      'Een leeg vakje is geen 0. Leeg telt niet mee; een 0 telt wel mee.',
      'Een leerling kan opnieuw indienen tot jij een score geeft. Daarna niet meer.',
      'Huiswerk zonder Max punten krijgt geen score. Pas dat aan via Bewerken.',
    ],
    lukt: [
      'Zegt een leerling dat hij indiende maar zie je niets: kijk of je de juiste klas en opdracht open hebt. Laat hem anders opnieuw indienen.',
    ],
    keywords: 'beoordelen score cijfer feedback commentaar nakijken',
  },
  {
    id: 'te-laat', category: 'Huiswerk', for: ['teacher', 'student'],
    title: 'Te laat ingediend huiswerk',
    intro: 'Na de deadline kan een leerling nog altijd indienen. De app zet er dan "Te laat ingediend" bij.',
    letOp: [
      'De app trekt zelf geen punten af. De leerkracht beslist hoeveel het waard is.',
      'Huiswerk op papier of mondeling is nooit te laat in de app.',
      'Is het huiswerk al beoordeeld, dan kan de leerling niet meer indienen.',
    ],
    keywords: 'deadline verstreken laat indienen',
  },

  // ── Aanwezigheid ────────────────────────────────────────────────────────
  {
    id: 'aanwezigheid', category: 'Aanwezigheid', for: ['teacher', 'admin'],
    title: 'Aanwezigheid opnemen',
    steps: [
      'Ga naar Aanwezigheid en klik bij de klas op Markeren.',
      'Kijk de Datum na. Standaard is het vandaag.',
      'Iedereen staat op Aanwezig. Zet wie er niet is op Afwezig, Te laat of Verontschuldigd.',
      'Geef je deze groep vandaag nog een vak? Vink dat vak aan onder "ook een ander vak": dan neem je alles in één keer op.',
      'Klik op Aanwezigheid opslaan (of "Opslaan voor 2 vakken").',
    ],
    letOp: [
      'Iedereen staat standaard op Aanwezig. Sla je op zonder te kijken, dan staat iedereen als aanwezig genoteerd.',
      'Elk vak krijgt zijn eigen aanwezigheid, alleen voor de leerlingen die dat vak volgen.',
      'De ouders zien de afwezigheden van hun eigen kind.',
      'Een les die niet opgenomen is, verschijnt bij het bestuur als "Niet gemarkeerd".',
    ],
    lukt: [
      'Iets verkeerd ingevuld? Klik opnieuw op Markeren en kies dezelfde datum: je ziet wat je toen invulde en kan het aanpassen.',
      'Een les vergeten? Kies bij Markeren de datum van die les.',
    ],
    keywords: 'afwezig aanwezig te laat verontschuldigd markeren register',
  },
  {
    id: 'aanwezigheid-overzicht', category: 'Aanwezigheid', for: ['teacher', 'admin'],
    title: 'Aanwezigheid terugkijken',
    steps: [
      'Ga naar Aanwezigheid en klik bij de klas op Overzicht.',
      'Kies Sessies voor de laatste 30 lessen, of Per leerling voor het hele schooljaar per kind.',
    ],
    keywords: 'overzicht historiek afwezigheden statistiek',
  },

  // ── Punten ──────────────────────────────────────────────────────────────
  {
    id: 'puntenlijst', category: 'Punten', for: ['teacher', 'admin'],
    title: 'De Puntenlijst lezen',
    intro: 'De Puntenlijst toont alle leerlingen van een klas met hun punten naast elkaar. Je vindt hem via Klassen → de klas → Puntenlijst.',
    steps: [
      'Elk gepubliceerd huiswerk en elke toets is een kolom.',
      'De kolom Gem. is het cijfer van de leerling. Met een puntenverdeling volgt hij die; zonder is het het gemiddelde over huiswerk en toetsen.',
      'Onder de punten staan de Beoordelingen (als de klas die heeft), de Doelen en de Examenresultaten.',
    ],
    letOp: [
      'Een leeg vakje is geen 0. Leeg telt niet mee; een 0 telt wel mee.',
      'De kolom Gem. telt de examens van beide semesters samen. Het rapport van semester 1 telt alleen het examen van semester 1.',
    ],
    keywords: 'gemiddelde cijfers overzicht punten',
  },
  {
    id: 'toets', category: 'Punten', for: ['teacher'],
    title: 'Een toets of mondelinge beurt toevoegen',
    steps: [
      'Klassen → de klas → Puntenlijst.',
      'Klik op "Toets of mondelinge opdracht toevoegen". Geef een Titel, het Max aantal punten en de Datum.',
      'Klik in de nieuwe kolom bij een leerling en typ zijn score. Enter bewaart.',
    ],
    letOp: [
      'Verwijder je een toets, dan verdwijnen alle scores ervan.',
      'Zonder puntenverdeling tellen de punten gewoon op: een toets op 50 weegt vijf keer zwaarder dan huiswerk op 10. Wil je dat anders, stel dan een puntenverdeling in.',
    ],
    keywords: 'test proefwerk mondeling punten invullen kolom',
  },
  {
    id: 'puntenverdeling', category: 'Punten', for: ['teacher', 'admin'],
    title: 'De puntenverdeling instellen',
    intro: 'Hier bepaal je hoe zwaar huiswerk, toetsen, het examen en je eigen beoordelingen meetellen in het cijfer.',
    steps: [
      'Klassen → de klas → Puntenverdeling.',
      'Kies een voorbeeld (Huiswerk en toetsen, Met examen, of Qur’an) of klik op Onderdeel toevoegen.',
      'Geef elk onderdeel een naam, kies waar het cijfer vandaan komt, en een percentage.',
      'Samen moet het precies 100% zijn. Klik op Opslaan.',
      'Gebruik je dezelfde verdeling in andere klassen, vink ze aan en klik op Kopiëren.',
    ],
    letOp: [
      'Stel je niets in, dan is het cijfer het gemiddelde van huiswerk en toetsen. Een examen telt dan NIET mee.',
      'Een onderdeel zonder punten telt (nog) niet mee; de rest wordt herrekend. Het cijfer heet dan "voorlopig".',
      'Pas je de verdeling aan, dan veranderen de cijfers van de hele klas. Op een rapport dat al bestaat pas na "Scores bijwerken".',
    ],
    lukt: [
      'Opslaan lukt niet? Kijk naar het totaal: het moet exact 100% zijn, en elk onderdeel moet een naam hebben.',
    ],
    keywords: 'weging gewicht procent percentage examen tajweed progressie verdeling',
  },
  {
    id: 'examen', category: 'Punten', for: ['teacher', 'admin'],
    title: 'Examenpunten invullen (en laten meetellen)',
    steps: [
      'Klassen → de klas → Puntenlijst → Examenresultaten.',
      'Klik op + bij de leerling, onder Examen S1 of Examen S2.',
      'Vul de score en het maximum in en druk op Enter.',
      'Heeft de klas geen onderdeel Examen in de puntenverdeling, dan vraagt de app of het examen moet meetellen. "Ja" opent de puntenverdeling met een voorstel. Kijk de percentages na en klik op Opslaan.',
    ],
    letOp: [
      'Zonder onderdeel Examen in de puntenverdeling telt het examen NIET mee in het gemiddelde en het rapport. Je ziet dan een gele melding boven de examens.',
      'Examen S1 telt op het rapport van semester 1, Examen S2 op dat van semester 2.',
    ],
    keywords: 'examen telt niet mee rapport semester examencijfer',
  },
  {
    id: 'beoordelingen', category: 'Punten', for: ['teacher'],
    title: 'Progressie, tajweed of inzet beoordelen',
    intro: 'Dit zijn onderdelen die je zelf een cijfer geeft. Ze staan op de Puntenlijst in de tabel Beoordelingen, als de puntenverdeling een onderdeel "Leerkracht vult zelf een cijfer in" heeft.',
    steps: [
      'Klassen → de klas → Puntenlijst → Beoordelingen.',
      'Vul bij de leerling zijn punt in, bijvoorbeeld 7 op 10.',
    ],
    letOp: [
      'Laat leeg wat je nog niet beoordeeld hebt. Een leeg onderdeel telt nog niet mee; het is geen 0.',
      'Zie je de tabel Beoordelingen niet, dan heeft de klas nog geen zo’n onderdeel. Voeg het toe in de Puntenverdeling.',
    ],
    keywords: 'handmatig progressie tajweed inzet gedrag eigen cijfer',
  },
  {
    id: 'doelen', category: 'Punten', for: ['teacher'],
    title: 'Een doel per leerling bijhouden',
    steps: [
      'Klassen → de klas → Puntenlijst → Doelen.',
      'Vul per leerling in waar hij begon, wat zijn doel is, waar hij nu staat en eventueel de voortgang in %.',
    ],
    letOp: [
      'De leerling en zijn ouders zien dit. Schrijf het zo dat een ouder het mag lezen.',
      'Het doel telt niet mee in het cijfer.',
    ],
    keywords: 'doel voortgang hifz memoriseren soera begonnen',
  },

  // ── Rapport ─────────────────────────────────────────────────────────────
  {
    id: 'rapport-leerkracht', category: 'Rapport', for: ['teacher'],
    title: 'Je vak invullen op het rapport',
    intro: 'Het bestuur maakt de rapporten aan. Jij kijkt het cijfer van je vak na en schrijft je commentaar.',
    steps: [
      'Ga naar Rapporten en kies het semester.',
      'Klik bij een leerling op Openen.',
      'Kijk het cijfer van je vak na. Het komt uit de Puntenlijst.',
      'Schrijf je commentaar: kort en concreet, wat gaat goed en wat mag beter.',
      'Klik op Opslaan. Publiceren doet het bestuur.',
    ],
    letOp: [
      'Het cijfer op het rapport wordt berekend op het moment dat het rapport gemaakt wordt. Gaf je daarna nog punten, vraag het bestuur dan om "Scores bijwerken".',
      'Een cijfer dat je met de hand aanpast, wordt overschreven als het bestuur daarna "Scores bijwerken" doet. Je commentaar blijft wel staan.',
      'Je kan alleen je eigen vak aanpassen, en alleen zolang het rapport een Concept is.',
      'Ouders lezen dit commentaar. Schrijf niets over gezondheid of de thuissituatie.',
    ],
    keywords: 'rapport commentaar cijfer semester invullen',
  },
  {
    id: 'rapport-bestuur', category: 'Rapport', for: ['admin'],
    title: 'Rapporten maken, publiceren en afdrukken',
    steps: [
      'Zorg dat alle punten erin staan, ook de examens.',
      'Rapporten → kies het semester → "Genereer voor alle leerlingen zonder rapport".',
      'Bestaan er al rapporten (of kwamen er punten bij), klik dan op "Scores bijwerken".',
      'Laat de leerkrachten hun commentaar schrijven.',
      'Lees na en klik op "Alles publiceren". De app zegt hoeveel rapporten nog een vak zonder score hebben.',
      'Klik op Afdrukken, kies een groep en klik op "Afdrukken / PDF". Zet in het afdrukvenster "Achtergrondafbeeldingen" aan.',
    ],
    letOp: [
      'Een rapport dat te vroeg gemaakt werd, heeft lege of oude scores. "Scores bijwerken" lost dat op voor alle concepten.',
      '"Scores bijwerken" overschrijft scores die iemand met de hand aanpaste. Commentaar blijft staan. Gepubliceerde rapporten veranderen niet.',
      'Na publiceren zien leerlingen en ouders het rapport meteen.',
      'De groepsnaam staat op het rapport als "Niveau". Schoolnaam, adres en logo stelt MasjidConnect in.',
    ],
    keywords: 'rapport genereren publiceren afdrukken pdf bulk alles bijwerken',
  },
  {
    id: 'rapport-terug', category: 'Rapport', for: ['admin'],
    title: 'Een gepubliceerd rapport nog aanpassen',
    steps: [
      'Open het rapport en klik op "Terug naar concept". De leerling ziet het dan niet meer.',
      'Pas aan (of laat de leerkracht aanpassen) en klik op Opslaan.',
      'Klik opnieuw op Publiceren.',
    ],
    keywords: 'fout rapport wijzigen terugzetten concept',
  },

  // ── Lesmateriaal en communicatie ────────────────────────────────────────
  {
    id: 'lesmodule', category: 'Lesmateriaal en communicatie', for: ['teacher'],
    title: 'Lesmateriaal delen (lesmodules)',
    steps: [
      'Ga naar Lesmodules en klik op Nieuwe module.',
      'Kies de klas, geef een Naam en eventueel een Beschrijving.',
      'Laat "Zichtbaar voor leerlingen" aan als ze het meteen mogen zien. Klik op Module aanmaken.',
      'Open de module, klik op Document toevoegen, kies het bestand, geef het een naam en klik op Uploaden.',
    ],
    letOp: [
      'PDF, Word of afbeeldingen, maximaal 20 MB per bestand.',
      'Iedereen in de klas kan het openen. Zet er geen gegevens van leerlingen in.',
    ],
    keywords: 'document pdf werkblad uploaden module materiaal',
  },
  {
    id: 'aankondiging', category: 'Lesmateriaal en communicatie', for: ['teacher', 'admin'],
    title: 'Een aankondiging plaatsen',
    steps: [
      'Op je Dashboard, bij Aankondigingen, klik op Plaatsen.',
      'Geef een titel en het bericht. Kies voor wie: een Specifieke klas, de Hele groep of Enkel leerkrachten.',
      'Klik op Plaatsen.',
    ],
    letOp: [
      'Leerlingen én ouders (die op het account van hun kind kijken) lezen dit.',
    ],
    keywords: 'bericht mededeling nieuws melding klas groep',
  },
  {
    id: 'nota-gezin', category: 'Lesmateriaal en communicatie', for: ['teacher', 'admin'],
    title: 'Een notitie schrijven (intern of voor het gezin)',
    steps: [
      'Ga naar Dossiers en open de leerling.',
      'Typ je notitie onder Notities.',
      'Moeten de leerling en de ouders het zien, vink dan "Delen met de leerling en de ouders" aan. Anders blijft het Intern.',
      'Klik op Toevoegen.',
    ],
    letOp: [
      'Een gedeelde notitie staat in het goud op het dashboard van de leerling, onder "Nota’s van de school".',
      'Ook een interne notitie kan een ouder later opvragen. Schrijf feiten, geen vermoedens.',
      'Schrijf niets over gezondheid of de thuissituatie. Geef dat mondeling door aan het bestuur.',
      'Per ongeluk gedeeld? Klik bij de notitie op "Intern zetten". Met "Delen" deel je een interne notitie alsnog.',
    ],
    keywords: 'nota notitie dossier ouders delen intern gedrag opvolging',
  },
  {
    id: 'oudercontact-slots', category: 'Lesmateriaal en communicatie', for: ['teacher', 'admin'],
    title: 'Momenten openzetten voor oudercontact',
    steps: [
      'Ga naar Oudercontact en klik op Slot toevoegen.',
      'Kies de Datum, Van en Tot, eventueel een klas (of "Geen specifieke klas"), en de Capaciteit.',
      'Klik op Aanmaken. Herhaal voor elk moment.',
    ],
    letOp: [
      'Verwijder je een slot, dan verdwijnen ook de inschrijvingen erop.',
      'Capaciteit 1 betekent één gezin per moment.',
    ],
    keywords: 'oudergesprek oudercontact afspraak slot moment',
  },
  {
    id: 'schooldocument-lezen', category: 'Lesmateriaal en communicatie', for: ['teacher', 'student'],
    title: 'Een schooldocument lezen en bevestigen',
    steps: [
      'Ga naar Schooldocumenten en open het document.',
      'Lees het, en klik op "Ik heb dit gelezen".',
    ],
    letOp: [
      'Dit bevestigt dat jij het gelezen hebt. Het is geen handtekening van een ouder.',
    ],
    keywords: 'reglement document lezen bevestigen',
  },

  // ── Klassen en gebruikers (bestuur) ─────────────────────────────────────
  {
    id: 'klas-aanmaken', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een klas en een groep aanmaken',
    intro: 'Een klas is één vak voor één groep. "Arabisch – Groep 2" en "Koran – Groep 2" zijn twee klassen.',
    steps: [
      'Ga naar Beheer en klik op Klas aanmaken.',
      'Kies het Schooljaar en de Groep. Bestaat de groep nog niet, kies dan "+ Nieuwe groep aanmaken…" en typ de naam.',
      'Vul het Vak in, eventueel een Beschrijving, en kies een Kleur. Klik op Klas aanmaken.',
    ],
    letOp: [
      'De groepsnaam staat op het rapport als "Niveau". Schrijf hem zoals de ouders hem kennen.',
      'Een klas zonder leerkracht wordt niet gebruikt. Koppel er meteen een leerkracht aan.',
    ],
    keywords: 'klas groep vak nieuw aanmaken niveau',
  },
  {
    id: 'gebruiker-toevoegen', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een leerling of leerkracht toevoegen',
    steps: [
      'Ga naar Beheer en klik op Gebruiker toevoegen.',
      'Vul Voornaam, Achternaam en E-mailadres in en kies de Rol.',
      'Kies de Groep: een leerling komt dan in alle vakken van die groep, een leerkracht krijgt alle vakken van die groep. Of kies "Of specifieke klas".',
      'Klik op Uitnodiging sturen. De persoon krijgt een mail om een wachtwoord te kiezen.',
    ],
    letOp: [
      'Volgt een leerling niet alle vakken van zijn groep, haal hem daarna uit de vakken die hij niet volgt (zie "Een leerling in een andere klas zetten").',
      'De hele school in één keer inladen doet MasjidConnect. Bezorg ons de lijst.',
      'Een e-mailadres kan je later niet zelf veranderen. Vraag het aan MasjidConnect.',
    ],
    keywords: 'nieuwe leerling inschrijven uitnodigen account aanmaken leerkracht',
  },
  {
    id: 'leerkracht-koppelen', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een leerkracht aan een klas koppelen',
    steps: [
      'Via de klas: Klassen → de klas → Leerkrachten → Leerkracht toevoegen.',
      'Of via de persoon: Beheer → bij de leerkracht het potloodje ("Gegevens, rol en klassen bewerken") → vink onder Klassen de klassen aan → Opslaan.',
    ],
    letOp: [
      'Op Beheer staat bij elke klas het aantal leerlingen en de naam van de leerkracht. Staat er geen naam, dan is er niemand gekoppeld.',
    ],
    keywords: 'leerkracht toewijzen klas koppelen vervangen',
  },
  {
    id: 'leerling-verplaatsen', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een leerling in een andere klas zetten',
    steps: [
      'Beheer → bij de leerling het icoon met de twee pijltjes (Verplaatsen naar andere klas).',
      'Onder Huidige klassen haal je hem uit een klas (Verwijderen uit klas).',
      'Bij "Toevoegen aan klas" kies je de nieuwe klas en klik je op Toevoegen.',
      'Klik op Opslaan.',
    ],
    letOp: [
      'Haal je een leerling uit een klas, dan ziet hij het huiswerk en de punten van die klas niet meer.',
      'Verandert een leerling van groep, verplaats hem dan voor elk vak.',
    ],
    keywords: 'verplaatsen andere groep klas wisselen vak uitschrijven',
  },
  {
    id: 'nieuw-wachtwoord', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Iemand een nieuw wachtwoord geven',
    steps: [
      'Beheer → bij de persoon het sleuteltje (Nieuw wachtwoord instellen) → Ja.',
      'De app toont een nieuw wachtwoord. Klik op Kopiëren en geef het aan de persoon.',
      'Bij de volgende keer aanmelden moet die zelf een eigen wachtwoord kiezen.',
    ],
    letOp: [
      'Geef het wachtwoord persoonlijk, niet in een groepschat.',
      'Alleen een beheerder kan dit. Leerkrachten niet.',
    ],
    keywords: 'wachtwoord reset kwijt vergeten leerling ouder',
  },
  {
    id: 'archiveren', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een leerling of leerkracht die vertrekt',
    steps: [
      'Beheer → bij de persoon het archiefdoosje (Archiveren) → Ja.',
      'De persoon kan niet meer aanmelden. Punten, aanwezigheid en rapporten blijven bewaard.',
      'Komt iemand terug: Beheer → Gearchiveerd → Reactiveren.',
    ],
    letOp: [
      'Archiveer, verwijder niet. "Ja, wissen" is alleen voor een officiële vraag om gegevens te wissen: het kan niet ongedaan worden.',
    ],
    keywords: 'uitschrijven vertrekken archiveren verwijderen wissen weg',
  },
  {
    id: 'gegevens-exporteren', category: 'Klassen en gebruikers', for: ['admin'],
    title: 'Een ouder vraagt welke gegevens jullie hebben',
    steps: [
      'Beheer → bij de leerling het pijltje naar beneden (Gegevens exporteren).',
      'Er wordt een bestand gedownload met alles wat de app over die leerling bijhoudt. Geef het aan de ouder.',
    ],
    letOp: [
      'Antwoord binnen de maand. Dat is wettelijk zo.',
      'Wil een ouder dat gegevens gewist worden, neem dan eerst contact op met MasjidConnect.',
    ],
    keywords: 'privacy inzage gdpr avg export gegevens ouder vraag',
  },

  // ── De school inrichten (bestuur) ───────────────────────────────────────
  {
    id: 'rooster', category: 'De school inrichten', for: ['admin'],
    title: 'Het lesrooster invullen',
    steps: [
      'Ga naar Rooster en klik op Les toevoegen.',
      'Kies de Klas, de Dag, het Beginuur en het Einduur, en eventueel de Locatie.',
      'Klik op Toevoegen. Herhaal voor elke les.',
    ],
    keywords: 'rooster uurrooster lessen uur lokaal',
  },
  {
    id: 'agenda', category: 'De school inrichten', for: ['admin'],
    title: 'Een activiteit of vakantie in de agenda zetten',
    steps: [
      'Ga naar Agenda en klik op Activiteit toevoegen.',
      'Geef een Titel, de datum (Van, Tot en met) en het uur, of vink "De hele dag" aan.',
      'Kies Voor wie: Hele school, Eén groep of Enkel personeel.',
      'Is er die dag geen les (vakantie, feestdag), vink dan Geen les aan. Klik op Opslaan.',
    ],
    letOp: [
      'Alleen het bestuur kan activiteiten toevoegen. Huiswerkdeadlines verschijnen vanzelf in de agenda.',
      '"Enkel personeel" zien de leerlingen niet.',
    ],
    keywords: 'kalender vakantie feestdag geen les uitstap activiteit',
  },
  {
    id: 'schooldocument-toevoegen', category: 'De school inrichten', for: ['admin'],
    title: 'Het schoolreglement of een brief online zetten',
    steps: [
      'Ga naar Schooldocumenten. Kies bij Document toevoegen de Soort (Schoolreglement, Kalender, Brief of Document) en geef een Titel.',
      'Klik op PDF kiezen en kies het bestand (maximaal 10 MB).',
    ],
    letOp: [
      'Leerlingen en leerkrachten kunnen bevestigen dat ze het lazen. Dat is geen handtekening van een ouder.',
    ],
    keywords: 'reglement brief document pdf uploaden',
  },
  {
    id: 'aanwezigheid-opvolgen', category: 'De school inrichten', for: ['admin'],
    title: 'Opvolgen of de aanwezigheid opgenomen is',
    steps: [
      'Op het Dashboard staat "Aanwezigheid — aandachtspunten": elke les die niet gemarkeerd is.',
      'Spreek de leerkracht van die les aan.',
    ],
    keywords: 'niet gemarkeerd aanwezigheid controle opvolgen',
  },
  {
    id: 'betalingen', category: 'De school inrichten', for: ['admin'],
    title: 'Lidgeld en betalingen bijhouden',
    steps: [
      'Ga naar Betalingen. Vul de tarieven in (Lidgeld per leerling, vervaldatum) en klik op Tarieven opslaan.',
      'Onder Lidgeld duid je per leerling aan wie Betaald heeft.',
      'Onder Lonen vul je per leerkracht het uurtarief en de uren in.',
    ],
    letOp: [
      'Een betaling die je per ongeluk aanduidde, zet je terug met Ongedaan maken.',
      'Voor de Chart-bijdrage per familie moeten leerlingen eerst aan een familie gekoppeld zijn, via hun dossier.',
    ],
    keywords: 'lidgeld betaling geld chart loon lonen',
  },
  {
    id: 'jaarovergang', category: 'De school inrichten', for: ['admin'],
    title: 'Naar een nieuw schooljaar',
    steps: [
      'Publiceer en druk eerst de rapporten van semester 2 af.',
      'Beheer → Jaarovergang → Nieuw schooljaar. Vul Naam, Startdatum en Einddatum in en klik op Aanmaken.',
      'Kies de klassen en de leerlingen die overgaan (of "Alle leerlingen selecteren") en klik op Jaarovergang uitvoeren.',
      'Het nieuwe schooljaar wordt actief, het oude inactief.',
    ],
    letOp: [
      'Rapporten horen bij het actieve schooljaar. Doe de jaarovergang pas als de rapporten klaar zijn.',
      'Archiveer wie niet terugkomt.',
    ],
    keywords: 'nieuw schooljaar jaarovergang september overzetten',
  },

  // ── Voor leerlingen en ouders ───────────────────────────────────────────
  {
    id: 'huiswerk-indienen', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Huiswerk bekijken en indienen',
    steps: [
      'Ga naar Huiswerk en open de opdracht.',
      'Typ je antwoord bij "Antwoord typen", of sleep een bestand naar "Bestand uploaden" (PDF, Word of een foto, maximaal 20 MB).',
      'Klik op Taak indienen.',
    ],
    letOp: [
      'Staat er "Op papier of mondeling", dan geef je het in de klas af. In de app moet je niets doen.',
      'Je kan opnieuw indienen tot de leerkracht een score geeft.',
      'Te laat? Je kan nog indienen, maar er staat dan "Te laat ingediend" bij.',
    ],
    keywords: 'taak indienen uploaden foto opdracht inleveren',
  },
  {
    id: 'punten-bekijken', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Je punten bekijken',
    steps: [
      'Ga naar Klassen, open het vak en klik op Mijn punten.',
      'Bovenaan staat Mijn cijfer. Daaronder de punten per opdracht, je doel en je examens.',
    ],
    letOp: [
      'Staat er "Voorlopig cijfer", dan zijn nog niet alle onderdelen ingevuld. Wat nog leeg is, telt nog niet mee.',
    ],
    keywords: 'cijfer punten resultaten score',
  },
  {
    id: 'aanwezigheid-bekijken', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Je aanwezigheid bekijken',
    steps: [
      'Ga naar Aanwezigheid en klik op Mijn aanwezigheid.',
    ],
    keywords: 'afwezig aanwezig te laat',
  },
  {
    id: 'rapport-bekijken', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Je rapport bekijken en afdrukken',
    steps: [
      'Ga naar Rapporten en kies het semester.',
      'Klik op "Rapport semester 1" (of 2).',
      'Klik op "Afdrukken / PDF" om het af te drukken of als PDF te bewaren.',
    ],
    letOp: [
      'Je ziet het rapport pas als de school het gepubliceerd heeft.',
    ],
    keywords: 'rapport afdrukken pdf semester',
  },
  {
    id: 'nota-van-school', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Een nota van de school lezen',
    intro: 'Wil de school jullie iets laten weten over je kind, dan staat het op het Dashboard in het goud, onder "Nota’s van de school".',
    keywords: 'nota bericht school ouders',
  },
  {
    id: 'oudercontact-inschrijven', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Inschrijven voor een oudergesprek',
    steps: [
      'Ga naar Oudercontact.',
      'Kies een moment en klik op Inschrijven.',
      'Toch niet? Klik op "Ingeschreven – annuleren".',
    ],
    letOp: [
      '"Volzet" betekent dat dat moment al bezet is. Kies een ander.',
    ],
    keywords: 'oudercontact oudergesprek afspraak inschrijven',
  },
  {
    id: 'ouders', category: 'Voor leerlingen en ouders', for: ['student'],
    title: 'Voor ouders: meekijken en de school bereiken',
    intro: 'Ouders kijken mee op het account van hun kind. Daar zien ze het huiswerk, de punten, de aanwezigheid, de nota’s van de school en het rapport.',
    letOp: [
      'Via de app kan je de school geen bericht sturen. Neem contact op met de leerkracht of het bestuur, zoals de school dat afsprak.',
      'Wachtwoord kwijt? Vraag het bestuur om een nieuw wachtwoord. Een leerkracht kan dat niet.',
    ],
    keywords: 'ouder contact school bericht meekijken',
  },
]

/** Lowercase, no accents: "Kopiëren" matches "kopieren". */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function articleText(a: HelpArticle): string {
  return normalize([a.title, a.category, a.intro, ...(a.steps ?? []), ...(a.letOp ?? []), ...(a.lukt ?? []), a.keywords]
    .filter(Boolean).join(' '))
}

/** Every word of the query must appear somewhere in the article. */
export function searchArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return articles
  return articles.filter(a => { const t = articleText(a); return words.every(w => t.includes(w)) })
}

/** What a role sees. An admin also sees the teacher articles; super_admin sees everything. */
export function audiencesFor(role: string | undefined): HelpAudience[] {
  switch (role) {
    case 'admin': return ['admin', 'teacher']
    case 'super_admin': return ['admin', 'teacher', 'student']
    case 'teacher': case 'leerlingenbegeleiding': return ['teacher']
    default: return ['student']
  }
}
