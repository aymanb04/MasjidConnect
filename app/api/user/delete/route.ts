import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { closeAccount, eraseUserData, retireAuthUser } from '@/lib/gdpr-erasure'

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
        const { data: target, error: targetErr } = await supabaseAdmin
            .from('profiles')
            .select('id, tenant_id, email')
            .eq('id', userId)
            .maybeSingle()
        if (targetErr) {
            console.error('[/api/user/delete] target lookup:', targetErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }
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

        // Last step: the login record. A hard delete cascades away the profile
        // and class links; when history blocks it (attendance, submissions),
        // GoTrue's soft delete empties the auth row instead -- name, e-mail and
        // login identity gone, the anonymous statistics still valid. Before
        // 2026-11-22 a blocked delete simply stopped here and the auth row kept
        // the person's name (review finding #2).
        const retired = await retireAuthUser(supabaseAdmin, userId, { allowHard: true })
        if ('error' in retired) {
            console.error('[/api/user/delete] erasure incomplete:', retired.error)
            return NextResponse.json(
                { error: 'De gegevens zijn gewist, maar het inlogaccount kon niet worden opgeruimd. Probeer opnieuw of neem contact op.' },
                { status: 500 }
            )
        }

        // Logged so an erasure can be evidenced to a school or the GBA later.
        console.info('[/api/user/delete] erased', userId, retired.removed, JSON.stringify(report))

        return NextResponse.json({
            success: true,
            deleted: retired.removed === 'hard',
            anonymised: true,
            erased: { ...report, auth: retired.removed },
        })
    } catch (e: any) {
        console.error('[/api/user/delete]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
