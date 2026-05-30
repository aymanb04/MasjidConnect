import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/user/reactivate', caller.id)
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
            .select('id, tenant_id, is_anonymized')
            .eq('id', userId)
            .single()

        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        // GDPR erasure is irreversible. The is_anonymized column is the source of
        // truth — previously we relied on first_name='Verwijderd' as a sentinel,
        // which would falsely block legitimate users with that name and silently
        // break if the anonymize routine ever changed the placeholder string.
        if (target.is_anonymized) {
            return NextResponse.json({ error: 'Geanonimiseerde gebruikers kunnen niet worden hersteld' }, { status: 400 })
        }

        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({ is_active: true })
            .eq('id', userId)
        if (profileErr) {
            console.error('[/api/user/reactivate] profile update:', profileErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Lift the auth ban
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
        })
        if (authErr) {
            console.error('[/api/user/reactivate] auth unban:', authErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('[/api/user/reactivate]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
