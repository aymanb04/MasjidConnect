'use client'

// The public one-pager at `/`. Client-side because lucide-react (0.395) has no
// 'use client' directive and its forwardRef icons can't render in an RSC — the
// markup is static, so Next still server-renders it for crawlers and link
// previews. Deliberately contact-only: sign-up is invite-only and there is no
// card payment flow, so there is no "start free trial" button to offer.

import Link from 'next/link'
import {
    ArrowRight,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    FileText,
    FolderOpen,
    GraduationCap,
    Layers,
    Lock,
    Megaphone,
    Server,
    ShieldCheck,
    Users,
    Wallet,
} from 'lucide-react'
import { MeemMark } from '@/components/ui/MeemMark'
import { DemoForm } from '@/components/marketing/DemoForm'

const REPLACES = [
    { from: 'Papieren puntenboekjes', to: 'Eén digitale puntenlijst per klas' },
    { from: 'WhatsApp-groepen', to: 'Mededelingen gericht per klas of groep' },
    { from: 'Excel-lijsten voor lidgeld', to: 'Betaald / niet betaald in één oogopslag' },
    { from: 'Rapporten met de hand overtypen', to: 'Punten staan al ingevuld' },
]

const AUDIENCES = [
    {
        icon: Users,
        title: 'Voor het bestuur',
        points: [
            'Leerlingen uitnodigen per e-mail of importeren via CSV — in minuten opgezet.',
            'Lidgeld per leerling en chart per gezin opvolgen: wie betaalde, wie nog niet.',
            'Lonen van leerkrachten: uren × uurtarief, automatisch berekend per maand.',
            'Jaarovergang met één wizard: nieuwe klasstructuur, leerlingen stromen door.',
            'Mededelingen gericht versturen: hele school, één groep, één klas of enkel leerkrachten.',
        ],
    },
    {
        icon: GraduationCap,
        title: 'Voor de leerkracht',
        points: [
            'Huiswerk uitdelen en verbeteren, met bestanden en feedback.',
            'Aanwezigheden nemen in minder dan een minuut — de app signaleert zelf wie twee lessen na elkaar afwezig was.',
            'Digitale puntenlijst voor toetsen op papier én online opdrachten, met automatisch gewogen gemiddelde.',
            'Rapporten: de punten staan er al in — enkel nakijken en commentaar schrijven.',
            'Oudercontact: zet tijdsloten open, de inschrijvingen komen binnen via het platform.',
        ],
    },
    {
        icon: BookOpen,
        title: 'Voor de leerling en thuis',
        points: [
            'Eén plek voor lesrooster, huiswerk, lesmateriaal en punten.',
            '"Mijn punten": altijd weten waar je staat, ook tussen twee rapporten door.',
            'Taken indienen als tekst of als bestand, rechtstreeks in de app.',
            'Het rapport verschijnt online zodra de school het publiceert — meteen af te drukken, tweetalig.',
        ],
    },
]

const FEATURES = [
    // "Wie in een groep zit, zit in alle vakken" read as a standing invariant.
    // The cascade runs when the student is invited/geïmporteerd into the group;
    // a vak added to that group later does not backfill existing leerlingen.
    { id: 'groepen', icon: Layers, title: 'Groepen & vakken', body: 'Een groep per niveau, een vak per leerkracht. Wie u in een groep plaatst, komt meteen in alle vakken van die groep terecht.' },
    { id: 'huiswerk', icon: FileText, title: 'Huiswerk', body: 'Opdrachten met deadline en maximumscore. Leerlingen dienen tekst of bestanden in, u verbetert met score en commentaar.' },
    { id: 'puntenlijst', icon: ClipboardCheck, title: 'Puntenlijst', body: 'Toetsen op papier, online opdrachten en examens in één raster, met een gewogen gemiddelde per leerling.' },
    { id: 'aanwezigheden', icon: CheckCircle2, title: 'Aanwezigheden', body: 'Per les afvinken in minder dan een minuut, met jaaroverzicht per leerling en een signaal bij herhaalde afwezigheid.' },
    { id: 'rapporten', icon: GraduationCap, title: 'Rapporten', body: 'Twee per jaar, tweetalig Arabisch/Nederlands, afdrukbaar als PDF. De vakleerkracht vult enkel zijn eigen vak in.' },
    { id: 'lesmodules', icon: BookOpen, title: 'Lesmodules', body: 'Lesmateriaal geordend per thema. Klaarzetten wanneer het u past, zichtbaar maken wanneer de klas eraan toe is.' },
    { id: 'dossiers', icon: FolderOpen, title: 'Leerlingendossiers', body: 'Contactgegevens, gezinsverband, notities en documenten — met leerlingbegeleiding als aparte rol.' },
    { id: 'betalingen', icon: Wallet, title: 'Betalingen & lonen', body: 'Lidgeld per leerling, chart per gezin, en de maandelijkse lonen van het team. Enkel zichtbaar voor het bestuur.' },
    { id: 'rooster', icon: CalendarDays, title: 'Rooster & agenda', body: 'Het weekrooster per klas, en een agenda die voor iedereen enkel zijn eigen lessen en deadlines toont.' },
    { id: 'mededelingen', icon: Megaphone, title: 'Mededelingen', body: 'Eén bericht naar de hele school, één groep, één klas of enkel het lerarenteam. Geen groepschats meer.' },
    { id: 'oudercontact', icon: Users, title: 'Oudercontact', body: 'Leerkrachten zetten tijdsloten open, de inschrijvingen lopen via het platform. Ouders hebben geen account nodig.' },
    { id: 'jaarovergang', icon: ArrowRight, title: 'Jaarovergang', body: 'Eén wizard aan het einde van het jaar: nieuw schooljaar, nieuwe structuur, leerlingen een groep hoger. Geen 200 namen hertypen.' },
]

// The hero chips. They used to be <span>s that looked exactly like buttons and
// did nothing when tapped — a false affordance in the highest-value strip of
// the page. Each one is now an anchor to its own card in the feature grid, so
// the thing they always looked like they would do is the thing they do.
// Every target is a FEATURES id above; the assertion below keeps it that way.
const PILLS = [
    { label: 'Huiswerk', id: 'huiswerk' },
    { label: 'Puntenlijst', id: 'puntenlijst' },
    { label: 'Aanwezigheden', id: 'aanwezigheden' },
    { label: 'Rapporten', id: 'rapporten' },
    { label: 'Lesmodules', id: 'lesmodules' },
    { label: 'Dossiers', id: 'dossiers' },
    { label: 'Betalingen', id: 'betalingen' },
    { label: 'Rooster', id: 'rooster' },
]

// A pill pointing at a fragment nobody renders scrolls nowhere and looks broken
// in exactly the way this change is meant to fix. Cheap to catch at module load
// if someone renames a feature later.
if (process.env.NODE_ENV !== 'production') {
    const missing = PILLS.filter(p => !FEATURES.some(f => f.id === p.id)).map(p => p.id)
    if (missing.length) console.error('[LandingPage] pills point at unknown feature ids:', missing)
}

const TRUST = [
    {
        icon: Lock,
        title: 'Elke moskee volledig afgeschermd',
        body: 'De scheiding tussen scholen zit in de database zelf (Row Level Security), niet enkel in de app. Zelfs een fout in de software kan de gegevens van een andere school niet tonen.',
    },
    {
        icon: Server,
        title: 'Gegevens in de EU',
        // "Alle bestanden" was wrong: tenant-logos and avatars are public
        // buckets. Everything carrying student data — ingediende taken,
        // lesmateriaal, dossierdocumenten, rapporten — is private, so the claim
        // is now scoped to exactly those.
        body: 'Alles staat op servers in Ierland (AWS eu-west-1). Ingediende taken, lesmateriaal en dossierdocumenten staan in privéopslag: links zijn tijdelijk en worden per klik aangemaakt.',
    },
    {
        icon: ShieldCheck,
        title: 'GDPR van bij de start',
        body: 'De moskee blijft verwerkingsverantwoordelijke, MasjidConnect is verwerker — hetzelfde model als Smartschool. Het recht op vergetelheid is ingebouwd, niet achteraf toegevoegd.',
    },
]

// Product screenshots live in public/screens/ and are regenerated by
// scripts/make-screenshots.mjs (gitignored operator script) against the demo
// tenant. Every person visible in them is stored as first name + last initial,
// so nothing here identifies a real pupil. Re-run that script whenever a
// captured screen changes shape.
//
// Plain <img>: next.config.js sets images.unoptimized, so next/image would add
// markup and buy nothing. width/height are the intrinsic pixel sizes and exist
// to reserve the right aspect ratio before the file lands (no layout shift).

function Shot({
    src, width, height, alt, caption, priority = false, chrome = true,
}: {
    src: string
    width: number
    height: number
    alt: string
    caption?: string
    priority?: boolean
    chrome?: boolean
}) {
    return (
        <figure>
            <div className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-modal">
                {/* Suggestion of a browser window: enough to read the image as a
                    real screen rather than an illustration, without pretending
                    to be a specific browser. */}
                {chrome && (
                    <div className="flex items-center gap-1.5 border-b border-border bg-gray-50 px-4 py-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                    </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- next/image
                    optimises nothing here: next.config.js sets images.unoptimized. */}
                <img
                    src={src}
                    width={width}
                    height={height}
                    alt={alt}
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    className="block h-auto w-full"
                />
                {/* The capture ends wherever the viewport did, which slices the
                    last table row in half. A short fade makes that read as
                    "scrolls further" rather than "broken image" — the same trick
                    PhoneShot already uses. Only for app screens: the rapport is a
                    whole document and is meant to end where it ends. */}
                {chrome && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
                )}
            </div>
            {caption && (
                <figcaption className="mt-3 text-sm leading-relaxed text-gray-500">{caption}</figcaption>
            )}
        </figure>
    )
}

function PhoneShot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
    return (
        <figure className="flex flex-col items-center">
            <div className="relative w-full max-w-[248px] overflow-hidden rounded-[2.25rem] border-[7px] border-gray-900 bg-gray-900 shadow-modal">
                {/* eslint-disable-next-line @next/next/no-img-element -- see Shot */}
                <img
                    src={src}
                    width={780}
                    height={1688}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full"
                />
                {/* The capture ends wherever the viewport did, which slices the
                    last card in half. A short fade to the app's own background
                    makes that read as "scrolls further" instead of "broken". */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface-warm to-transparent" />
            </div>
            {caption && (
                <figcaption className="mt-3 max-w-[248px] text-center text-sm leading-relaxed text-gray-500">
                    {caption}
                </figcaption>
            )}
        </figure>
    )
}

export function LandingPage() {
    return (
        <div className="min-h-dvh bg-surface-warm">
            {/* ---------------------------------------------------------------- nav */}
            <header className="sticky top-0 z-40 border-b border-border/70 bg-surface-warm/85 backdrop-blur">
                <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                            <MeemMark className="text-white" size={22} />
                        </span>
                        <span className="font-semibold text-gray-900">MasjidConnect</span>
                    </div>

                    <div className="hidden items-center gap-7 text-sm text-gray-600 md:flex">
                        <a href="#voor-wie" className="transition-colors hover:text-primary-600">Voor wie</a>
                        <a href="#beeld" className="transition-colors hover:text-primary-600">In beeld</a>
                        <a href="#functies" className="transition-colors hover:text-primary-600">Functies</a>
                        <a href="#veilig" className="transition-colors hover:text-primary-600">Veilig &amp; GDPR</a>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Never hidden: a signed-out teacher opening a phone
                            bookmark of / had no door at all here — the only login
                            link sat ~10 000px down in the footer. The CTA label
                            drops its second word instead, so both still fit 390px. */}
                        <Link href="/login" className="btn-ghost">Inloggen</Link>
                        <a href="#demo" className="btn-primary">
                            {/* One flex child, not two: .btn is inline-flex gap-2, so a
                                bare <span> sibling would space the label by 8px instead of
                                a word space. */}
                            <span>Demo<span className="hidden sm:inline"> aanvragen</span></span>
                        </a>
                    </div>
                </nav>
            </header>

            {/* overflow-x-clip, not -hidden: the hero screenshot bleeds past the
                container on a negative margin, which made the document 16-32px
                wider than the viewport between 1024 and ~1300px (a sideways
                scrollbar on a 1280 MacBook and on iPad landscape). Clip trims it
                without creating a scroll container, so the sticky header and the
                scroll-mt-20 anchors keep working. */}
            <main className="overflow-x-clip">
                {/* ------------------------------------------------------------ hero */}
                <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
                    <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
                        <div className="animate-slide-up">
                            <span className="badge bg-primary-50 text-primary-700">
                                Voor Arabische en islamitische scholen in België
                            </span>

                            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
                                Alles voor uw weekendschool in één app.
                            </h1>

                            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
                                Geen papieren puntenboekjes, geen WhatsApp-chaos, geen Excel-lijsten meer.
                                MasjidConnect brengt lessen, huiswerk, punten, aanwezigheden en rapporten
                                samen op één plek — in het Nederlands, met tweetalige rapporten.
                            </p>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <a href="#demo" className="btn-primary h-11 px-5 text-base">
                                    Demo aanvragen <ArrowRight size={17} />
                                </a>
                                {/* Outlined green rather than .btn-secondary: white
                                    on the warm ground gave this control a 1.07:1 fill
                                    and a 1.20:1 border — no visible boundary at all,
                                    which fails WCAG 1.4.11. */}
                                <a href="#beeld" className="btn h-11 border border-primary-500 px-5 text-base font-medium text-primary-700 hover:bg-primary-50 active:scale-[0.98]">
                                    Bekijk de app
                                </a>
                            </div>

                            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-gray-500">
                                {['Gegevens in de EU (Ierland)', 'Elke moskee volledig afgeschermd', 'Werkt op gsm, tablet en pc'].map(item => (
                                    <li key={item} className="flex items-center gap-2">
                                        <CheckCircle2 size={15} className="flex-shrink-0 text-primary-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* The puntenlijst, not the dashboard: it is the screen that
                            replaces the paper puntenboekje, which is the promise the
                            headline opens with. Widened past the column so the table
                            stays readable at this size. */}
                        <div className="animate-slide-up lg:-mr-16 xl:-mr-28">
                            <Shot
                                src="/screens/puntenlijst.png"
                                width={1600}
                                height={1000}
                                priority
                                alt="De digitale puntenlijst van een klas: per leerling de score op elke opdracht, met het klasgemiddelde onderaan."
                            />
                        </div>
                    </div>

                    {/* Full width under the grid rather than inside the copy
                        column: in the column the row made the left side taller
                        than the screenshot beside it, which left a band of dead
                        space under the image. */}
                    <div className="mt-10 flex flex-wrap gap-2 lg:mt-14">
                        {PILLS.map(({ label, id }) => (
                            <a
                                key={id}
                                href={`#${id}`}
                                className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                            >
                                {label}
                            </a>
                        ))}
                    </div>
                </section>

                {/* -------------------------------------------------------- vervangt */}
                <section className="border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                            Wat het vervangt
                        </h2>
                        <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                            {REPLACES.map(({ from, to }) => (
                                <div key={from}>
                                    <p className="text-sm text-gray-500 line-through decoration-gray-400">{from}</p>
                                    <p className="mt-1.5 font-medium leading-snug text-gray-900">{to}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --------------------------------------------------------- voor wie */}
                <section id="voor-wie" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            Iedereen ziet enkel wat hij nodig heeft
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            Bestuur, leerkracht en leerling loggen in op dezelfde app en krijgen elk hun
                            eigen scherm. Wie geen toegang hoort te hebben, krijgt hem ook niet.
                        </p>
                    </div>

                    <div className="mt-11 grid gap-6 lg:grid-cols-3">
                        {AUDIENCES.map(({ icon: Icon, title, points }) => (
                            <div key={title} className="card flex flex-col p-7">
                                <span className="stat-icon bg-primary-50">
                                    <Icon size={21} className="text-primary-600" />
                                </span>
                                <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
                                <ul className="mt-4 space-y-3">
                                    {points.map(point => (
                                        <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-gray-600">
                                            <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-primary-400" />
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ------------------------------------------------------------ beeld */}
                {/* No top padding: the "voor wie" section above already ends on a
                    generous pb, and both sit on the warm background. */}
                <section id="beeld" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            Zo ziet het eruit
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            Echte schermen uit de app, met een voorbeeldschool. Alles in het Nederlands,
                            het rapport tweetalig.
                        </p>
                    </div>

                    <div className="mt-11 grid items-start gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
                        {/* The rapport is captured as the document itself, so it needs
                            no browser chrome — it is a page, not a screen. */}
                        <Shot
                            src="/screens/rapport.png"
                            width={1600}
                            height={1235}
                            chrome={false}
                            alt="Een rapport met per vak het resultaat en de commentaar van de vakleerkracht, in het Arabisch en het Nederlands naast elkaar."
                            caption="Het rapport: tweetalig Arabisch/Nederlands, met de punten al ingevuld en klaar om af te drukken."
                        />
                        <PhoneShot
                            src="/screens/mobiel-dashboard.png"
                            alt="Het startscherm van een leerling op een smartphone, met de mededelingen van de school."
                            caption="Leerlingen en leerkrachten werken even goed op de gsm als op de pc."
                        />
                    </div>

                    <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:gap-12">
                        <Shot
                            src="/screens/aanwezigheid.png"
                            width={1568}
                            height={1280}
                            alt="Het aanwezigheidsscherm van een klas, met per leerling de keuze aanwezig, afwezig, te laat of verontschuldigd."
                            caption="Aanwezigheden nemen: één klas afvinken in minder dan een minuut."
                        />
                        <Shot
                            src="/screens/huiswerk.png"
                            width={1568}
                            height={1280}
                            alt="Het huiswerkoverzicht van een leerkracht, met de opdrachten per klas en hun deadline."
                            caption="Huiswerk per klas, met deadline — leerlingen dienen in via de app."
                        />
                    </div>
                </section>

                {/* --------------------------------------------------------- functies */}
                <section id="functies" className="scroll-mt-20 border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
                        <div className="max-w-2xl">
                            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                                Alles wat een weekendschool draaiende houdt
                            </h2>
                            <p className="mt-4 text-lg leading-relaxed text-gray-600">
                                Geen losse tools die aan elkaar geplakt zijn — elk onderdeel weet van de andere.
                                Een verbeterd huiswerk telt mee in het gemiddelde, en dat gemiddelde staat al
                                op het rapport.
                            </p>
                        </div>

                        <div className="mt-11 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map(({ id, icon: Icon, title, body }) => (
                                // scroll-mt clears the 64px sticky header plus a
                                // little air, so a pill lands on the card and not
                                // under the nav.
                                <div key={id} id={id} className="scroll-mt-28">
                                    <div className="flex items-center gap-2.5">
                                        <Icon size={18} className="flex-shrink-0 text-primary-500" />
                                        <h3 className="font-semibold text-gray-900">{title}</h3>
                                    </div>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ----------------------------------------------------------- veilig */}
                <section id="veilig" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            Veilig, en volgens de regels
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            U werkt met gegevens van kinderen. Dat vraagt meer dan een wachtwoordscherm.
                        </p>
                    </div>

                    <div className="mt-11 grid gap-6 lg:grid-cols-3">
                        {TRUST.map(({ icon: Icon, title, body }) => (
                            <div key={title} className="card p-7">
                                <span className="stat-icon bg-gold-50">
                                    <Icon size={21} className="text-gold-600" />
                                </span>
                                <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
                                <p className="mt-2.5 text-sm leading-relaxed text-gray-600">{body}</p>
                            </div>
                        ))}
                    </div>

                    <p className="mt-8 max-w-3xl text-sm leading-relaxed text-gray-500">
                        Toegang is uitsluitend op uitnodiging: er is geen open registratie. Elke gebruiker
                        aanvaardt de{' '}
                        <Link href="/legal/voorwaarden" className="font-medium text-primary-600 hover:underline">voorwaarden</Link>
                        {' '}en de{' '}
                        <Link href="/legal/privacy" className="font-medium text-primary-600 hover:underline">privacyverklaring</Link>
                        {' '}vóór het eerste gebruik.
                    </p>
                </section>

                {/* ---------------------------------------------------------- roadmap */}
                <section className="border-t border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
                        <div className="card border-dashed p-7 sm:p-8">
                            <h2 className="text-lg font-semibold text-gray-900">Waar we nu aan bouwen</h2>
                            <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-gray-600">
                                MasjidConnect is in actief gebruik en groeit mee met de scholen die het gebruiken.
                                Op de planning staan een <strong className="font-medium text-gray-900">apart ouderportaal</strong>,{' '}
                                <strong className="font-medium text-gray-900">Hifz- en Koranopvolging</strong> per leerling, en een{' '}
                                <strong className="font-medium text-gray-900">Franstalige versie</strong> van de app.
                                Staat wat u nodig hebt er nog niet bij? Laat het weten — de volgorde wordt bepaald
                                door de scholen die meedoen.
                            </p>
                        </div>
                    </div>
                </section>

                {/* -------------------------------------------------------------- cta */}
                <section id="demo" className="relative scroll-mt-20 overflow-hidden bg-primary-500">
                    <div className="pattern-bg absolute inset-0" />
                    <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/5" />
                    <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
                        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Benieuwd hoe het er voor uw school uitziet?
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/80">
                            De schermen hierboven zijn een voorproefje. Laat uw gegevens achter en we
                            lopen samen door het platform, met uw eigen klasstructuur erin.
                        </p>
                        {/* The page's single conversion point. Every "Demo aanvragen"
                            in the nav and the hero is an anchor to this section, so
                            there is one destination and one thing to measure. The
                            address stays inside the form, as a fallback line rather
                            than a rival control. */}
                        <div className="mx-auto mt-9 max-w-xl">
                            <DemoForm />
                        </div>

                        {/* Rehomed from the old hero brand panel, which the product
                            screenshot replaced. Same green ground, so it keeps the
                            setting it was designed for. */}
                        <div className="mt-14 border-t border-white/15 pt-8">
                            {/* lang/dir are not decoration: without them a screen
                                reader pronounces the Arabic with the page's Dutch
                                voice (WCAG 3.1.2, Language of Parts). The old
                                white/50 and white/35 were 2.86:1 and 2.20:1. */}
                            <p lang="ar" dir="rtl" className="font-arabic text-xl text-white/80">
                                طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ
                            </p>
                            <p className="mt-2 text-sm text-white/80">
                                &ldquo;Het zoeken naar kennis is een plicht voor elke moslim.&rdquo;
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            {/* ------------------------------------------------------------- footer */}
            <footer className="border-t border-border bg-surface-warm">
                <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
                    <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                                    <MeemMark className="text-white" size={22} />
                                </span>
                                <span className="font-semibold text-gray-900">MasjidConnect</span>
                            </div>
                            <p className="mt-3 text-sm text-gray-500">
                                Het schoolplatform voor moskeescholen.<br />Antwerpen, België.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
                            <div>
                                <p className="font-medium text-gray-900">Platform</p>
                                <ul className="mt-3 space-y-2 text-gray-500">
                                    <li><a href="#functies" className="hover:text-primary-600">Functies</a></li>
                                    <li><a href="#veilig" className="hover:text-primary-600">Veilig &amp; GDPR</a></li>
                                    <li><Link href="/login" className="hover:text-primary-600">Inloggen</Link></li>
                                </ul>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">Juridisch</p>
                                <ul className="mt-3 space-y-2 text-gray-500">
                                    <li><Link href="/legal/privacy" className="hover:text-primary-600">Privacyverklaring</Link></li>
                                    <li><Link href="/legal/voorwaarden" className="hover:text-primary-600">Gebruiksvoorwaarden</Link></li>
                                </ul>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">Contact</p>
                                <ul className="mt-3 space-y-2 text-gray-500">
                                    <li><a href="tel:+32485670822" className="hover:text-primary-600">+32 485 67 08 22</a></li>
                                    <li><a href="https://wa.me/32485670822" className="hover:text-primary-600" rel="noopener">WhatsApp</a></li>
                                    <li><a href="mailto:ayman@masjidconnect.be" className="hover:text-primary-600">ayman@masjidconnect.be</a></li>
                                    <li><a href="mailto:privacy@masjidconnect.be" className="hover:text-primary-600">privacy@masjidconnect.be</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-gray-500">
                        MasjidConnect is een dienst van Ayman Boulayoune (eenmanszaak) · KBO BE 1034.397.409
                        <span className="mx-1.5">·</span>
                        © {new Date().getFullYear()} — Alle rechten voorbehouden
                    </div>
                </div>
            </footer>
        </div>
    )
}
