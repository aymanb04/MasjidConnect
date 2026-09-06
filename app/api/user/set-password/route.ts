import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

// Set a new password for another user, and hand it back once so it can be
// written down or printed.
//
// Why this exists: pupils are onboarded with school-issued logins on a domain
// that receives no mail, so "wachtwoord vergeten" — which mails a reset link —
// is a dead end for them. Without this route a forgotten password could only be
// fixed by the operator, for every pupil, forever. It also rescues staff whose
// invite mail never arrived, which is already a known failure mode.
//
// The password is generated here rather than chosen by the admin: a room full
// of pupils otherwise ends up sharing one password an admin liked typing.

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// No 0/O, 1/l/I: these are read off paper by children and copied by hand.
const LOWER  = 'abcdefghijkmnopqrstuvwxyz'
const UPPER  = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALPHABET = LOWER + UPPER + DIGITS

function pick(set: string, n = 1): string[] {
    const bytes = new Uint8Array(n)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => set[b % set.length])
}

/**
 * Supabase enforces at least one lowercase, one uppercase and one digit, so
 * drawing every character from one combined alphabet is not enough: a draw that
 * happens to contain no digit is rejected with
 * "Password should contain at least one character of each: …".
 * That fails intermittently — it worked on the first test run and failed on the
 * second — which is the worst way for it to fail, in front of a waiting pupil.
 * Guarantee one of each class, then shuffle so the required ones aren't always
 * in the same positions.
 */
function generatePassword(length = 12): string {
    const chars = [
        ...pick(LOWER),
        ...pick(UPPER),
        ...pick(DIGITS),
        ...pick(ALPHABET, length - 3),
    ]
    // Fisher-Yates with crypto randomness.
    const r = new Uint32Array(chars.length)
    crypto.getRandomValues(r)
    for (let i = chars.length - 1; i > 0; i--) {
        const j = r[i] % (i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join('')
}

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/user/set-password', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        const { data: target } = await supabaseAdmin
            .from('profiles')
            .select('id, role, tenant_id, is_active, is_anonymized')
            .eq('id', userId)
            .single()

        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        // Own tenant only.
        if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        // The escalation this route would otherwise open: a school admin resets
        // the password of MasjidConnect's own cross-tenant account and owns
        // every school. Only a super_admin may reset a super_admin.
        if (target.role === 'super_admin' && caller.role !== 'super_admin') {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        // A GDPR-erased account must stay closed. is_anonymized is the sentinel
        // the anonymize route sets precisely so it cannot be revived.
        if (target.is_anonymized) {
            return NextResponse.json(
                { error: 'Dit account is definitief gewist en kan niet heropend worden.' },
                { status: 409 }
            )
        }

        const password = generatePassword()

        const { error: setErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password,
            // School-issued logins never receive mail, so their address would
            // otherwise stay unconfirmed and block sign-in.
            email_confirm: true,
        })
        if (setErr) {
            console.error('[/api/user/set-password]', setErr.message)
            return NextResponse.json({ error: 'Instellen van het wachtwoord is mislukt.' }, { status: 500 })
        }

        // Anyone already signed in with the old password is signed out — if the
        // reset is because someone else knew it, leaving their session alive
        // would defeat the point.
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            },
        })

        // Who reset whose password, never the password itself.
        console.info('[/api/user/set-password] by', caller.id, 'for', userId)

        return NextResponse.json({ success: true, password })
    } catch (e: any) {
        console.error('[/api/user/set-password]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
