'use client'

// The English page at /en. Not a line-by-line translation of the Dutch page:
// that one sells to Belgian school boards (demo form, Dutch-only contact), and
// the people reading this one are mostly not buyers -- international contacts,
// recruiters, other developers. So it describes the same product with the same
// real screenshots, adds how it is built, and ends on a plain e-mail address.
// Client component for the same reason as LandingPage (lucide-react has no
// 'use client'); the markup still server-renders.
//
// Every claim here must stay true. The numbers ("100+ pupils", "since September
// 2026") are the same ones the Dutch page uses; update both together.

import Link from 'next/link'
import {
    ArrowRight,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Code2,
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
import { Shot, PhoneShot } from '@/components/marketing/LandingPage'

const REPLACES = [
    { from: 'Paper grade books', to: 'One digital gradebook per class' },
    { from: 'WhatsApp groups', to: 'Announcements aimed at a class or group' },
    { from: 'Fee lists in Excel', to: 'Paid / not paid at a glance' },
    { from: 'Retyping report cards by hand', to: 'Grades are already filled in' },
]

const AUDIENCES = [
    {
        icon: Users,
        title: 'For the school board',
        points: [
            'Invite pupils by e-mail or import them from CSV.',
            'Track membership fees per pupil and per family.',
            'Monthly teacher pay: hours × hourly rate, calculated automatically.',
            'Move to the next school year with one wizard.',
        ],
    },
    {
        icon: GraduationCap,
        title: 'For teachers',
        points: [
            'Set and grade homework, with files and written feedback.',
            'Take attendance in under a minute; the app flags pupils absent twice in a row.',
            'A gradebook for paper tests and online work, with a weighted average.',
            'Report cards arrive with the grades already in; teachers add comments.',
        ],
    },
    {
        icon: BookOpen,
        title: 'For pupils and their families',
        points: [
            'Timetable, homework, course material and grades in one place.',
            'Hand in work as text or as a file, straight from a phone.',
            'The report card appears online as soon as the school publishes it.',
        ],
    },
]

const FEATURES = [
    { icon: Layers, title: 'Groups & subjects', body: 'One group per level, one subject per teacher. A pupil placed in a group is enrolled in all of its subjects.' },
    { icon: FileText, title: 'Homework', body: 'Assignments with a deadline and a maximum score, for the whole class or per pupil, on paper or handed in through the app.' },
    { icon: ClipboardCheck, title: 'Gradebook', body: 'Paper tests, online assignments and exams in one grid, with a weighting each class can set.' },
    { icon: CheckCircle2, title: 'Attendance', body: 'Mark a class in under a minute, with a yearly overview per pupil and a signal on repeated absence.' },
    { icon: GraduationCap, title: 'Report cards', body: 'Twice a year, bilingual Arabic/Dutch, right-to-left where it should be, printable as PDF.' },
    { icon: FolderOpen, title: 'Pupil records', body: 'Contact details, family links, notes and documents, with a separate role for pupil counsellors.' },
    { icon: Wallet, title: 'Fees & payroll', body: 'Membership fees per pupil, a fee per family, and the team’s monthly pay. Visible to the board only.' },
    { icon: CalendarDays, title: 'Timetable & calendar', body: 'The weekly timetable per class, and a calendar that shows each person only their own lessons and deadlines.' },
    { icon: Megaphone, title: 'Announcements', body: 'One message to the whole school, one group, one class or the teaching team only.' },
]

const STACK = ['Next.js 15', 'React 19', 'TypeScript', 'PostgreSQL (Supabase)', 'Row Level Security', 'Tailwind CSS', 'Vercel']

const BUILT = [
    {
        title: 'Tenant isolation in the database',
        body: 'Every school is a tenant. Isolation is enforced by Postgres row-level security on every table, plus a restrictive “tenant wall” policy, so a missing filter in application code cannot leak another school’s data. A CI job seeds two schools and checks that neither can read or write the other’s rows.',
    },
    {
        title: 'Making those policies fast',
        body: 'Correct policies turned out to be slow on real data. Profiling them and rewriting the hot ones as set-based checks made reads 10–100× faster without changing who can see what.',
    },
    {
        title: 'GDPR built in, not bolted on',
        body: 'Erasure reaches the uploaded files in storage, not only the database rows, and a person’s or a whole school’s data can be exported. Grade changes are kept in an audit log.',
    },
    {
        title: 'Bilingual, right-to-left documents',
        body: 'Report cards are generated from the gradebook and printed with Arabic and Dutch side by side, which means getting bidirectional text and print layout right.',
    },
]

const TRUST = [
    { icon: Lock, title: 'Each school walled off', body: 'A teacher sees only their own classes, a pupil only their own grades — enforced by the database itself.' },
    { icon: Server, title: 'Data stays in the EU', body: 'Hosted in Ireland (AWS eu-west-1). Submitted work and documents are in private storage behind short-lived links.' },
    { icon: ShieldCheck, title: 'GDPR from day one', body: 'The school stays the data controller and MasjidConnect is the processor, under a data processing agreement.' },
]

export function LandingPageEn() {
    return (
        <div lang="en" className="min-h-dvh bg-surface-warm">
            {/* ---------------------------------------------------------------- nav */}
            <header className="sticky top-0 z-40 border-b border-border/70 bg-surface-warm/85 backdrop-blur">
                <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
                    <Link href="/en" className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                            <MeemMark className="text-white" size={22} />
                        </span>
                        <span className="font-semibold text-gray-900">MasjidConnect</span>
                    </Link>

                    <div className="hidden items-center gap-7 text-sm text-gray-600 md:flex">
                        <a href="#who" className="transition-colors hover:text-primary-600">Who it’s for</a>
                        <a href="#screens" className="transition-colors hover:text-primary-600">Screens</a>
                        <a href="#features" className="transition-colors hover:text-primary-600">Features</a>
                        <a href="#built" className="transition-colors hover:text-primary-600">How it’s built</a>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link href="/" hrefLang="nl" lang="nl" className="btn-ghost hidden sm:inline-flex" title="Nederlands">NL</Link>
                        <a href="#contact" className="btn-primary">Contact</a>
                    </div>
                </nav>
            </header>

            <main className="overflow-x-clip">
                {/* ------------------------------------------------------------ hero */}
                <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
                    <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
                        <div className="animate-slide-up">
                            <span className="badge bg-primary-50 text-primary-700">
                                School platform for mosque weekend schools · Belgium
                            </span>

                            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
                                Less Excel and WhatsApp. One place to run a weekend school.
                            </h1>

                            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
                                Mosque weekend schools teach Arabic and Qur’an to children on Saturdays and
                                Sundays, and are run almost entirely by volunteers. MasjidConnect gives the
                                board, teachers and pupils one app for attendance, homework, grades and
                                bilingual Arabic/Dutch report cards.
                            </p>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <a href="#screens" className="btn-primary h-11 px-5 text-base">
                                    See the app <ArrowRight size={17} />
                                </a>
                                <a href="#built" className="btn h-11 border border-primary-500 px-5 text-base font-medium text-primary-700 hover:bg-primary-50 active:scale-[0.98]">
                                    How it’s built
                                </a>
                            </div>

                            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-gray-500">
                                {['In use since September 2026 at a school with 100+ pupils', 'Data stored in the EU (Ireland)', 'Works on phone, tablet and desktop'].map(item => (
                                    <li key={item} className="flex items-center gap-2">
                                        <CheckCircle2 size={15} className="flex-shrink-0 text-primary-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="animate-slide-up lg:-mr-16 xl:-mr-28">
                            <Shot
                                src="/screens/puntenlijst.png"
                                width={1600}
                                height={1000}
                                priority
                                alt="A class gradebook: each pupil's score on every assignment, with the class average at the bottom."
                            />
                        </div>
                    </div>
                </section>

                {/* -------------------------------------------------------- replaces */}
                <section className="border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                            What it replaces
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

                {/* -------------------------------------------------------------- who */}
                <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            Everyone sees only what they need
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            The board, teachers and pupils log in to the same app and each get their own screens.
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

                {/* ---------------------------------------------------------- screens */}
                <section id="screens" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            What it looks like
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            Real screens from the app, with a sample school. The interface is in Dutch, the
                            language of the schools it serves; report cards are bilingual.
                        </p>
                    </div>

                    <div className="mt-11 grid items-start gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
                        <Shot
                            src="/screens/rapport.png"
                            width={1600}
                            height={1235}
                            chrome={false}
                            alt="A report card with each subject's result and the teacher's comment, in Arabic and Dutch side by side."
                            caption="The report card: Arabic and Dutch side by side, grades filled in from the gradebook, ready to print."
                        />
                        <PhoneShot
                            src="/screens/mobiel-dashboard.png"
                            alt="A pupil's home screen on a smartphone, with the school's announcements."
                            caption="Pupils and teachers work just as well on a phone as on a computer."
                        />
                    </div>

                    <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:gap-12">
                        <Shot
                            src="/screens/aanwezigheid.png"
                            width={1568}
                            height={1280}
                            alt="The attendance screen of a class, with present, absent, late or excused for each pupil."
                            caption="Taking attendance: one class in under a minute."
                        />
                        <Shot
                            src="/screens/huiswerk.png"
                            width={1568}
                            height={1280}
                            alt="A teacher's homework overview, with assignments per class and their deadlines."
                            caption="Homework per class with deadlines; pupils hand in through the app."
                        />
                    </div>
                </section>

                {/* --------------------------------------------------------- features */}
                <section id="features" className="scroll-mt-20 border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
                        <div className="max-w-2xl">
                            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                                Everything a weekend school runs on
                            </h2>
                            <p className="mt-4 text-lg leading-relaxed text-gray-600">
                                Not separate tools glued together: a graded assignment counts towards the
                                average, and that average is already on the report card.
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

                {/* ------------------------------------------------------------ built */}
                <section id="built" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                            How it’s built
                        </h2>
                        <p className="mt-4 text-lg leading-relaxed text-gray-600">
                            Designed, built and run by one person, Ayman Boulayoune: product, database,
                            application code, deployment, support, and the GDPR paperwork with the school.
                        </p>
                    </div>

                    <ul className="mt-8 flex flex-wrap gap-2" aria-label="Technology">
                        {STACK.map(t => (
                            <li key={t} className="rounded-full border border-border bg-white px-3 py-1.5 text-sm text-gray-700">
                                {t}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-10 grid gap-6 sm:grid-cols-2">
                        {BUILT.map(({ title, body }) => (
                            <div key={title} className="card p-7">
                                <div className="flex items-center gap-2.5">
                                    <Code2 size={18} className="flex-shrink-0 text-primary-500" />
                                    <h3 className="font-semibold text-gray-900">{title}</h3>
                                </div>
                                <p className="mt-2.5 text-sm leading-relaxed text-gray-600">{body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ------------------------------------------------------------- safe */}
                <section className="border-y border-border bg-white">
                    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
                        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                            Children’s data, handled accordingly
                        </h2>
                        <div className="mt-9 grid gap-6 lg:grid-cols-3">
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
                    </div>
                </section>

                {/* ---------------------------------------------------------- contact */}
                <section id="contact" className="relative scroll-mt-20 overflow-hidden bg-primary-500">
                    <div className="pattern-bg absolute inset-0" />
                    <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
                        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Get in touch</h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/80">
                            Questions about the product or how it was built? E-mail me directly.
                        </p>
                        <a href="mailto:ayman@masjidconnect.be"
                            className="btn mt-8 h-11 bg-white px-5 text-base font-medium text-primary-700 hover:bg-primary-50">
                            <Mail size={17} /> ayman@masjidconnect.be
                        </a>
                        <p className="mt-6 text-sm text-white/80">
                            A school in Belgium looking for a demo?{' '}
                            <Link href="/#demo" hrefLang="nl" className="font-medium text-white underline underline-offset-2">
                                Request one on the Dutch page
                            </Link>.
                        </p>

                        <div className="mt-14 border-t border-white/15 pt-8">
                            <p lang="ar" dir="rtl" className="font-arabic text-xl text-white/80">
                                طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ
                            </p>
                            <p className="mt-2 text-sm text-white/80">
                                &ldquo;Seeking knowledge is an obligation upon every Muslim.&rdquo;
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            {/* ------------------------------------------------------------- footer */}
            <footer className="border-t border-border bg-surface-warm">
                <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <p>
                        MasjidConnect · Antwerp, Belgium · a service of Ayman Boulayoune (sole trader),
                        company no. BE 1034.397.409
                    </p>
                    <div className="flex gap-5">
                        <Link href="/" hrefLang="nl" className="hover:text-primary-600">Nederlands</Link>
                        <Link href="/legal/privacy" className="hover:text-primary-600">Privacy (NL)</Link>
                        <Link href="/login" className="hover:text-primary-600">Log in</Link>
                    </div>
                </div>
            </footer>
        </div>
    )
}
