import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { CURRENT_TERMS_VERSION } from '@/lib/terms'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Records that the caller accepted the current Voorwaarden.
// Uses the service role on purpose: the update_own_profile RLS policy subqueries
// profiles in its WITH CHECK, which Postgres rejects as "infinite recursion" on a
// client-side self-update. Verifying the Bearer token here keeps it safe — a user
// can only ever set their OWN flag (caller.id), never someone else's.
// Every role that can reach the dashboard must be listed here. The dashboard
// layout redirects anyone with unaccepted terms to /akkoord, and /akkoord can
// only get out via this route — so a role missing from this array is locked out
// of the app entirely, with no workaround in the UI.
// 'leerlingenbegeleiding' was missing until 2026-08-26 (added in migrations
// 13/14/25 but never here). Nobody was locked out at the time only because the
// one existing counselor's terms_accepted_at had been written out-of-band; the
// next counselor invited, or the next CURRENT_TERMS_VERSION bump, would have hit
// it. scripts/rls-smoke.ts now covers the role so the gap cannot reopen silently.
export async function POST(request: Request) {
    const auth = await requireRole(request, [
        'student', 'teacher', 'admin', 'super_admin', 'leerlingenbegeleiding',
    ])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({
            terms_accepted_at: new Date().toISOString(),
            terms_version: CURRENT_TERMS_VERSION,
        })
        .eq('id', caller.id)

    if (error) {
        console.error('[/api/terms/accept]', error.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
