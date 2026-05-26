import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type CallerProfile = {
    id: string
    role: string
    tenant_id: string
    is_active: boolean
}

export async function requireRole(
    request: Request,
    allowedRoles: string[]
): Promise<{ caller: CallerProfile } | { error: NextResponse }> {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
        return { error: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) }
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
        return { error: NextResponse.json({ error: 'Ongeldige sessie' }, { status: 401 }) }
    }

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, tenant_id, is_active')
        .eq('id', user.id)
        .single()

    if (!profile) {
        return { error: NextResponse.json({ error: 'Profiel niet gevonden' }, { status: 403 }) }
    }

    // Defense-in-depth: Supabase auth ban is the primary guard for archived
    // users, but we double-check is_active here so a valid JWT that somehow
    // survives a ban (edge case / clock skew) cannot reach privileged routes.
    if (!profile.is_active) {
        return { error: NextResponse.json({ error: 'Account gedeactiveerd' }, { status: 403 }) }
    }

    if (!allowedRoles.includes(profile.role)) {
        return { error: NextResponse.json({ error: 'Geen toegang' }, { status: 403 }) }
    }

    return { caller: profile as CallerProfile }
}
