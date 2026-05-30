import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: Request) {
    const auth = await requireRole(request, ['super_admin'])
    if ('error' in auth) return auth.error

    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        // Verwijdert auth user → cascade verwijdert profiel + klaskoppelingen automatisch
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) {
            console.error('[/api/user/delete] auth delete:', error.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('[/api/user/delete]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
