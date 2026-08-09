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
    Mail,
    Megaphone,
    Server,
    ShieldCheck,
    Users,
    Wallet,
} from 'lucide-react'
import { MeemMark } from '@/components/ui/MeemMark'

const MAILTO = 'mailto:ayman@masjidconnect.be?subject=Demo%20aanvraag%20MasjidConnect'

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
    { icon: Layers, title: 'Groepen & vakken', body: 'Een groep per niveau, een vak per leerkracht. Wie u in een groep plaatst, komt meteen in alle vakken van die groep terecht.' },
    { icon: FileText, title: 'Huiswerk', body: 'Opdrachten met deadline en maximumscore. Leerlingen dienen tekst of bestanden in, u verbetert met score en commentaar.' },
    { icon: ClipboardCheck, title: 'Puntenlijst', body: 'Toetsen op papier, online opdrachten en examens in één raster, met een gewogen gemiddelde per leerling.' },
    { icon: CheckCircle2, title: 'Aanwezigheden', body: 'Per les afvinken in minder dan een minuut, met jaaroverzicht per leerling en een signaal bij herhaalde afwezigheid.' },
    { icon: GraduationCap, title: 'Rapporten', body: 'Twee per jaar, tweetalig Arabisch/Nederlands, afdrukbaar als PDF. De vakleerkracht vult enkel zijn eigen vak in.' },
    { icon: BookOpen, title: 'Lesmodules', body: 'Lesmateriaal geordend per thema. Klaarzetten wanneer het u past, zichtbaar maken wanneer de klas eraan toe is.' },
    { icon: FolderOpen, title: 'Leerlingendossiers', body: 'Contactgegevens, gezinsverband, notities en documenten — met leerlingbegeleiding als aparte rol.' },
    { icon: Wallet, title: 'Betalingen & lonen', body: 'Lidgeld per leerling, chart per gezin, en de maandelijkse lonen van het team. Enkel zichtbaar voor het bestuur.' },
    { icon: CalendarDays, title: 'Rooster & agenda', body: 'Het weekrooster per klas, en een agenda die voor iedereen enkel zijn eigen lessen en deadlines toont.' },
    { icon: Megaphone, title: 'Mededelingen', body: 'Eén bericht naar de hele school, één groep, één klas of enkel het lerarenteam. Geen groepschats meer.' },
    { icon: Users, title: 'Oudercontact', body: 'Leerkrachten zetten tijdsloten open, de inschrijvingen lopen via het platform. Ouders hebben geen account nodig.' },
    { icon: ArrowRight, title: 'Jaarovergang', body: 'Eén wizard aan het einde van het jaar: nieuw schooljaar, nieuwe structuur, leerlingen een groep hoger. Geen 200 namen hertypen.' },
]

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
                        <a href="#functies" className="transition-colors hover:text-primary-600">Functies</a>
                        <a href="#veilig" className="transition-colors hover:text-primary-600">Veilig &amp; GDPR</a>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link href="/login" className="btn-ghost hidden sm:inline-flex">Inloggen</Link>
                        <a href={MAILTO} className="btn-primary">Demo aanvragen</a>
                    </div>
                </nav>
            </header>

            <main>
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
                                <a href={MAILTO} className="btn-primary h-11 px-5 text-base">
                                    Demo aanvragen <ArrowRight size={17} />
                                </a>
                                <a href="#functies" className="btn-secondary h-11 px-5 text-base">
                                    Bekijk de functies
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

                        {/* Brand panel — mirrors the login screen rather than showing a
                            product screenshot, so nothing here can drift out of date. */}
                        <div className="relative hidden overflow-hidden rounded-3xl bg-primary-500 p-10 shadow-modal lg:block">
                            <div className="pattern-bg absolute inset-0" />
                            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/5" />
                            <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/[0.06]" />
                            <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

                            <div className="relative z-10 flex h-full min-h-[400px] flex-col justify-between">
                                <p className="text-2xl font-semibold leading-snug text-white">
                                    Eén login voor de hele school.
                                </p>

                                <div className="flex flex-wrap gap-2">
                                    {['Huiswerk', 'Puntenlijst', 'Aanwezigheden', 'Rapporten', 'Lesmodules', 'Dossiers', 'Betalingen', 'Rooster'].map(pill => (
                                        <span key={pill} className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white/90">
                                            {pill}
                                        </span>
                                    ))}
                                </div>

                                <div className="text-right">
                                    <p className="font-arabic text-base text-white/45">
                                        طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ
                                    </p>
                                    <p className="mt-1 text-xs text-white/30">
                                        &ldquo;Het zoeken naar kennis is een plicht voor elke moslim.&rdquo;
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* -------------------------------------------------------- vervangt */}
                <section className="border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                            Wat het vervangt
                        </h2>
                        <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                            {REPLACES.map(({ from, to }) => (
                                <div key={from}>
                                    <p className="text-sm text-gray-400 line-through decoration-gray-300">{from}</p>
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
                            {FEATURES.map(({ icon: Icon, title, body }) => (
                                <div key={title}>
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
                <section className="relative overflow-hidden bg-primary-500">
                    <div className="pattern-bg absolute inset-0" />
                    <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/5" />
                    <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
                        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Benieuwd hoe het er voor uw school uitziet?
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/75">
                            Stuur een bericht en we tonen u het platform van binnenuit — met een
                            voorbeeldschool, niet met een reeks screenshots.
                        </p>
                        <div className="mt-9 flex flex-wrap justify-center gap-3">
                            <a href={MAILTO} className="btn h-11 bg-white px-6 text-base font-semibold text-primary-700 shadow-sm hover:bg-white/90 active:scale-[0.98]">
                                <Mail size={17} /> Demo aanvragen
                            </a>
                            <a href="mailto:ayman@masjidconnect.be" className="btn h-11 border border-white/25 px-6 text-base font-medium text-white hover:bg-white/10 active:scale-[0.98]">
                                ayman@masjidconnect.be
                            </a>
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
                                    <li><a href="mailto:ayman@masjidconnect.be" className="hover:text-primary-600">ayman@masjidconnect.be</a></li>
                                    <li><a href="mailto:privacy@masjidconnect.be" className="hover:text-primary-600">privacy@masjidconnect.be</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-gray-400">
                        MasjidConnect is een dienst van Ayman Boulayoune (eenmanszaak) · KBO BE 1034.397.409
                        <span className="mx-1.5">·</span>
                        © {new Date().getFullYear()} — Alle rechten voorbehouden
                    </div>
                </div>
            </footer>
        </div>
    )
}
