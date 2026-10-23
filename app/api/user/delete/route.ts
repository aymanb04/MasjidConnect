import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { closeAccount, eraseUserData } from '@/lib/gdpr-erasure'

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
        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        // Close and anonymise FIRST. The auth delete at the end fails for
        // anyone with attendance or a submission (no ON DELETE rule on those
        // FKs, confirmed live 2026-10-23). It used to run last, after the
        // dossier was already wiped, and left the account active under the
        // person's real name.
        const closeErr = await closeAccount(supabaseAdmin, userId)
        if (closeErr) {
            console.error('[/api/user/delete]', closeErr)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Uploaded files live in storage, which no FK cascade reaches. Purge
        // them before the auth delete — once the rows that point at the files
        // cascade away, an orphaned file can no longer be found.
        const report = await eraseUserData(supabaseAdmin, userId, {
            tenantId: target.tenant_id,
            email:    target.email,
        })

        if (report.errors.length) {
            // Stop before deleting the auth user. The pointer rows still exist,
            // so a retry can still find the files.
            console.error('[/api/user/delete] erasure incomplete:', report.errors.join(' | '))
            return NextResponse.json(
                { error: 'Het account is afgesloten, maar niet alle gegevens konden worden gewist. De gebruiker is NIET verwijderd — probeer opnieuw of neem contact op.' },
                { status: 500 }
            )
        }

        // Cascade removes the profile and class links. When history blocks it,
        // the person stays as an anonymous row: erased all the same (Art. 17),
        // and the school's statistics stay whole.
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) {
            console.info('[/api/user/delete] kept as anonymous row (history):', userId, error.message, JSON.stringify(report))
            return NextResponse.json({ success: true, deleted: false, anonymised: true, erased: report })
        }

        // Logged so an erasure can be evidenced to a school or the GBA later.
        console.info('[/api/user/delete] erased', userId, JSON.stringify(report))

        return NextResponse.json({ success: true, deleted: true, anonymised: true, erased: report })
    } catch (e: any) {
        console.error('[/api/user/delete]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
