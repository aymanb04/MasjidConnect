import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

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
            .update({ is_active: false })
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

        // Force-revoke all active sessions immediately so the user is kicked out
        // right away rather than waiting for their JWT to expire (up to 1 hour)
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            },
        })

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('[/api/user/archive]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
