import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { closeAccount, eraseUserData } from '@/lib/gdpr-erasure'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/user/anonymize', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        // The e-mail is captured here, before step 2 overwrites it: pending
        // invitations key on the address rather than the user id.
        const { data: target } = await supabaseAdmin
            .from('profiles')
            .select('id, tenant_id, email')
            .eq('id', userId)
            .single()

        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        // ── Steps 1–2: ban the account FIRST, then scrub the profile ───────────
        // Shared with /api/user/delete (lib/gdpr-erasure.ts closeAccount).
        const closeErr = await closeAccount(supabaseAdmin, userId)
        if (closeErr) {
            console.error('[/api/user/anonymize]', closeErr)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // ── Step 3: Erase everything else this person left behind ──────────────
        // Dossier (details, notes, documents), goals, rapport PDFs and comments,
        // submission files and text, free-text notes on scores/attendance/
        // oudercontact, per-pupil task texts, and pending invitations.
        // Shared with /api/user/delete.
        const report = await eraseUserData(supabaseAdmin, userId, {
            tenantId: target.tenant_id,
            email:    target.email,
        })

        if (report.errors.length) {
            // Scrubbing the profile already succeeded, so the account is unusable —
            // but say plainly that data remains, rather than reporting success.
            console.error('[/api/user/anonymize] erasure incomplete:', report.errors.join(' | '))
            return NextResponse.json(
                { error: 'Het account is afgesloten, maar niet alle gegevens konden worden gewist. Neem contact op met de beheerder.' },
                { status: 500 }
            )
        }

        // Logged so an erasure can be evidenced to a school or the GBA later.
        console.info('[/api/user/anonymize] erased', userId, JSON.stringify(report))

        return NextResponse.json({ success: true, erased: report })
    } catch (e: any) {
        console.error('[/api/user/anonymize]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
