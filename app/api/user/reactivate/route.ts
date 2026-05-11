import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({ is_active: true })
            .eq('id', userId)
        if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

        // Lift the auth ban
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
        })
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
