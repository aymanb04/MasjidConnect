import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/user/anonymize', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { userId } = await request.json()
        if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

        const { data: target } = await supabaseAdmin
            .from('profiles')
            .select('id, tenant_id')
            .eq('id', userId)
            .single()

        if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })

        if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
        }

        // ── Step 1: Ban auth account + revoke sessions FIRST ──────────────────
        // This must happen before any data scrubbing so the user can never log in
        // during the window between profile erasure and auth account closure.
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email:        `anon-${userId}@deleted.invalid`,
            ban_duration: '876000h',
        })
        if (authErr) {
            console.error('[/api/user/anonymize] auth ban:', authErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // Force-revoke all active sessions immediately
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
            },
        })

        // ── Step 2: Scrub PII from the profiles row ────────────────────────────
        // UUID stays intact so FK relations (submissions, class_students, etc.)
        // remain valid for historical stats.
        // is_anonymized=true marks this row as GDPR-erased so reactivation is
        // blocked (cannot rely on first_name='Verwijderd' as a sentinel —
        // someone could legitimately have that name).
        const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({
                first_name:    'Verwijderd',
                last_name:     '',
                email:         `anon-${userId}@deleted.invalid`,
                avatar_url:    null,
                phone:         null,
                is_active:     false,
                is_anonymized: true,
            })
            .eq('id', userId)
        if (profileErr) {
            console.error('[/api/user/anonymize] profile scrub:', profileErr.message)
            return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
        }

        // ── Step 3: Scrub submission text content ──────────────────────────────
        await supabaseAdmin
            .from('submissions')
            .update({ text_content: null })
            .eq('student_id', userId)

        // ── Step 4: Delete uploaded files from storage + remove DB records ─────
        const { data: submissions } = await supabaseAdmin
            .from('submissions')
            .select('id')
            .eq('student_id', userId)

        const submissionIds = submissions?.map(s => s.id) ?? []

        const { data: submissionFiles } = submissionIds.length
            ? await supabaseAdmin
                .from('submission_files')
                .select('id, file_url')
                .in('submission_id', submissionIds)
            : { data: [] }

        if (submissionFiles?.length) {
            const paths = submissionFiles.map(f => {
                // Handle both stored paths and legacy full public URLs
                const marker = '/object/public/submission-files/'
                const idx = f.file_url.indexOf(marker)
                return idx !== -1 ? f.file_url.slice(idx + marker.length) : f.file_url
            })

            // Storage deletion is a GDPR requirement — return an error if it fails
            // so the caller knows the erasure is incomplete.
            const { error: storageErr } = await supabaseAdmin.storage
                .from('submission-files')
                .remove(paths)
            if (storageErr) {
                console.error('[/api/user/anonymize] storage removal:', storageErr.message)
                return NextResponse.json(
                    { error: 'Bestanden konden niet worden verwijderd. Neem contact op met de beheerder.' },
                    { status: 500 }
                )
            }

            await supabaseAdmin
                .from('submission_files')
                .delete()
                .in('id', submissionFiles.map(f => f.id))
        }

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('[/api/user/anonymize]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
