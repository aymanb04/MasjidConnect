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

    const rl = await checkRateLimit('/api/user/archive', caller.id)
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
            .select('id, tenant_id')
            .eq('id', userId)
            .single()

        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        // Admins can only manage users in their own tenant
        if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            // archived_at starts the retention clock published in the
            // privacyverklaring (dossier ≤ 12 months, results ≤ 2 years).
            .update({ is_active: false, archived_at: new Date().toISOString() })
            .eq('id', userId)
        if (profileErr) {
            console.error('[/api/user/archive] profile update:', profileErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Ban from auth so they can't log in — 10 year duration (effectively permanent)
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: '876000h',
        })
        if (authErr) {
            console.error('[/api/user/archive] auth ban:', authErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // The ban is what ends their sessions: a banned user's refresh token is
        // refused ("User Banned"). The admin /logout call that used to follow
        // returned 404 every time (no such endpoint, checked 2026-10-23). An
        // access token already issued lasts at most 1 hour, and the app ends a
        // session whose profile is inactive (useProfile).

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('[/api/user/archive]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
