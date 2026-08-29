import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

// Demo requests from the public landing page. Unauthenticated by definition, so
// the rate limit keys on the caller IP rather than a user id.
//
// Deliberately e-mail only — no `contact_requests` table. A prospect's name,
// school and phone number are personal data; keeping them in the mailbox they
// were always going to land in avoids a new store to document, secure and purge
// under GDPR, and avoids a migration on a repo whose migrations are public.

const TO   = 'ayman@masjidconnect.be'
// noreply@ on the verified masjidconnect.be domain (Resend, eu-west-1). The
// prospect's own address goes in reply_to, so hitting Reply answers them.
const FROM = 'MasjidConnect <noreply@masjidconnect.be>'

const MAX = { naam: 120, school: 160, email: 200, telefoon: 40, bericht: 2000 }

function clean(v: unknown, max: number): string {
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function POST(req: NextRequest) {
    // Vercel puts the real client IP first in x-forwarded-for.
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'anon'

    const rl = await checkRateLimit('/api/contact', ip)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel aanvragen vanaf dit adres. Probeer het later opnieuw of mail ons rechtstreeks.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
    }

    // Honeypot: a field hidden from people and irresistible to form-filling bots.
    // Answer 200 so the bot has nothing to learn from the difference.
    if (clean(body.website, 200)) return NextResponse.json({ ok: true })

    const naam     = clean(body.naam, MAX.naam)
    const school   = clean(body.school, MAX.school)
    const email    = clean(body.email, MAX.email)
    const telefoon = clean(body.telefoon, MAX.telefoon)
    const bericht  = clean(body.bericht, MAX.bericht)

    if (!naam || !school || !email) {
        return NextResponse.json({ error: 'Naam, school en e-mailadres zijn verplicht.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return NextResponse.json({ error: 'Dat e-mailadres lijkt niet te kloppen.' }, { status: 400 })
    }

    const key = process.env.RESEND_KEY
    if (!key) {
        console.error('[contact] RESEND_KEY is not set — demo request dropped')
        return NextResponse.json({ error: 'Versturen is tijdelijk niet mogelijk.' }, { status: 500 })
    }

    const text = [
        `Naam:      ${naam}`,
        `School:    ${school}`,
        `E-mail:    ${email}`,
        `Telefoon:  ${telefoon || '—'}`,
        '',
        bericht || '(geen bericht)',
    ].join('\n')

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM,
                to: [TO],
                reply_to: email,
                subject: `Demo-aanvraag — ${school}`,
                text,
            }),
        })

        if (!res.ok) {
            console.error('[contact] Resend rejected the send:', res.status, await res.text())
            return NextResponse.json({ error: 'Versturen mislukt. Probeer het opnieuw.' }, { status: 502 })
        }
    } catch (err) {
        console.error('[contact] Resend unreachable:', err)
        return NextResponse.json({ error: 'Versturen mislukt. Probeer het opnieuw.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
}
