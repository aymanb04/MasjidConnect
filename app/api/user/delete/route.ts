import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: Request) {
    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        // Verwijdert auth user → cascade verwijdert profiel + klaskoppelingen automatisch
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}