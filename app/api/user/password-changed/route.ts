import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Clear the caller's own must_change_password flag (migration 37).
//
// Why this is a route and not a one-line client-side update: a profiles.update()
// executed by the row's own owner recurses through this project's policies and
// dies with 42P17. Every profile write therefore goes through the service role.
//
// It only ever touches the CALLER's own row. The user id comes from verifying
// the bearer token with Supabase, never from the request body, so this cannot be
// pointed at somebody else's profile.

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    if (!token) {
        return NextResponse.json({ error: 'Niet aangemeld.' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) {
        return NextResponse.json({ error: 'Niet aangemeld.' }, { status: 401 })
    }

    const { error: updErr } = await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('id', data.user.id)

    if (updErr) {
        console.error('[/api/user/password-changed]', updErr.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
