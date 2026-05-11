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

        // Scrub all PII from the profiles row — UUID stays intact so FK relations
        // (submissions, class_students, etc.) remain valid for historical stats
        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({
                first_name: 'Verwijderd',
                last_name:  '',
                email:      `anon-${userId}@deleted.invalid`,
                avatar_url: null,
                phone:      null,
                is_active:  false,
            })
            .eq('id', userId)
        if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

        // Anonymize auth email + ban permanently so no login is ever possible
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email:        `anon-${userId}@deleted.invalid`,
            ban_duration: '876000h',
        })
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
