import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { eraseUserData } from '@/lib/gdpr-erasure'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: Request) {
    const auth = await requireRole(request, ['super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/user/delete', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        // Read the profile BEFORE anything is destroyed: the erasure needs the
        // tenant (storage path prefix) and the e-mail (pending invitations key
        // on the address, not the user id).
        const { data: target } = await supabaseAdmin
            .from('profiles')
            .select('id, tenant_id, email')
            .eq('id', userId)
            .single()

        // Uploaded files live in storage, which no FK cascade reaches. Purge
        // them FIRST — once the auth user is gone the rows that point at the
        // files are gone too, and an orphaned file can no longer be found.
        const report = await eraseUserData(supabaseAdmin, userId, {
            tenantId: target?.tenant_id,
            email:    target?.email,
        })

        if (report.errors.length) {
            // Stop before deleting the auth user. The pointer rows still exist,
            // so a retry can still find the files; deleting now would strand
            // them permanently.
            console.error('[/api/user/delete] erasure incomplete:', report.errors.join(' | '))
            return NextResponse.json(
                { error: 'Niet alle gegevens konden worden gewist. De gebruiker is NIET verwijderd — probeer opnieuw of neem contact op.' },
                { status: 500 }
            )
        }

        // Verwijdert auth user → cascade verwijdert profiel + klaskoppelingen automatisch
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) {
            console.error('[/api/user/delete] auth delete:', error.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Logged so an erasure can be evidenced to a school or the GBA later.
        console.info('[/api/user/delete] erased', userId, JSON.stringify(report))

        return NextResponse.json({ success: true, erased: report })
    } catch (e: any) {
        console.error('[/api/user/delete]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
