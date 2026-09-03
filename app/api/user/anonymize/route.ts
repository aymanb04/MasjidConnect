import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { eraseUserData } from '@/lib/gdpr-erasure'

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

        // ── Step 1: Ban auth account + revoke sessions FIRST ──────────────────
        // This must happen before any data scrubbing so the user can never log in
        // during the window between profile erasure and auth account closure.
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email:        `anon-${userId}@deleted.invalid`,
            ban_duration: '876000h',
        })
        if (authErr) {
            console.error('[/api/user/anonymize] auth ban:', authErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Force-revoke all active sessions immediately
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            },
        })

        // ── Step 2: Scrub PII from the profiles row ────────────────────────────
        // UUID stays intact so FK relations (submissions, class_students, etc.)
        // remain valid for historical stats.
        // is_anonymized=true marks this row as GDPR-erased so reactivation is
        // blocked (cannot rely on first_name='Verwijderd' as a sentinel —
        // someone could legitimately have that name).
        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({
                first_name:    'Verwijderd',
                last_name:     '',
                email:         `anon-${userId}@deleted.invalid`,
                phone:         null,
                is_active:     false,
                is_anonymized: true,
            })
            .eq('id', userId)
        if (profileErr) {
            console.error('[/api/user/anonymize] profile scrub:', profileErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // ── Step 3: Erase everything else this person left behind ──────────────
        // Dossier (details, notes, documents incl. Art. 9 health data), rapport
        // PDFs, submission files and text, free-text notes on attendance/exams/
        // oudercontact, and pending invitations. Shared with /api/user/delete.
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
