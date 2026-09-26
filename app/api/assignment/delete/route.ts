// Delete one homework assignment, and everything hanging off it.
//
// Why this is a service-role route and not a client-side .delete():
// `teacher_manage_assignments` already lets a teacher of the class delete the
// row, and the FK cascade already removes the submissions, the per-pupil rows,
// the feedback and the submission_files ROWS. What the cascade cannot do is
// touch Storage -- the uploaded files stay in the `submission-files` bucket
// forever, unreferenced and invisible. That is the same gap lib/gdpr-erasure.ts
// was written for, and a delete button that ignores it only looks like it
// works.
//
// Order matters: the files go first. If the bucket is unreachable we stop and
// report a failure with the assignment still intact, because a teacher who is
// told "verwijderd" while 29 uploads survive has been told something false. The
// other order -- row gone, files orphaned -- cannot be retried, since nothing
// points at those files any more.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Storage paths are stored as plain paths now; legacy rows kept a full public URL. */
function toStoragePath(bucket: string, fileUrl: string): string {
    const marker = `/object/public/${bucket}/`
    const idx = fileUrl.indexOf(marker)
    return idx !== -1 ? fileUrl.slice(idx + marker.length) : fileUrl
}

export async function POST(request: Request) {
    const auth = await requireRole(request, ['teacher', 'admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/assignment/delete', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { assignmentId } = await request.json()
        if (!assignmentId) return NextResponse.json({ error: 'assignmentId verplicht' }, { status: 400 })

        const { data: assignment } = await supabaseAdmin
            .from('assignments')
            .select('id, title, class_id, classes(tenant_id)')
            .eq('id', assignmentId)
            .single()

        if (!assignment) return NextResponse.json({ error: 'Huiswerk niet gevonden' }, { status: 404 })

        // The service role reads past RLS, so the check the database would have
        // done has to be done here, by hand, in full.
        const tenantId = (assignment.classes as any)?.tenant_id
        if (caller.role !== 'super_admin') {
            if (tenantId !== caller.tenant_id) {
                return NextResponse.json({ error: 'Geen toegang tot dit huiswerk' }, { status: 403 })
            }
            if (caller.role === 'teacher') {
                const { data: teaches } = await supabaseAdmin
                    .from('class_teachers')
                    .select('class_id')
                    .eq('class_id', assignment.class_id)
                    .eq('teacher_id', caller.id)
                    .maybeSingle()
                if (!teaches) {
                    return NextResponse.json({ error: 'Je geeft deze klas geen les' }, { status: 403 })
                }
            }
        }

        // ── 1. The uploaded files, out of the bucket ───────────────────────────
        const { data: submissions } = await supabaseAdmin
            .from('submissions')
            .select('id')
            .eq('assignment_id', assignmentId)
        const submissionIds = (submissions ?? []).map(s => s.id)

        let filesRemoved = 0
        if (submissionIds.length) {
            const { data: files, error: filesErr } = await supabaseAdmin
                .from('submission_files')
                .select('file_url')
                .in('submission_id', submissionIds)
            if (filesErr) {
                console.error('[/api/assignment/delete] list files:', filesErr.message)
                return NextResponse.json({ error: 'De bestanden konden niet worden opgehaald. Er is niets verwijderd.' }, { status: 500 })
            }

            const paths = (files ?? []).map(f => toStoragePath('submission-files', f.file_url))
            if (paths.length) {
                const { error: rmErr } = await supabaseAdmin.storage.from('submission-files').remove(paths)
                if (rmErr) {
                    console.error('[/api/assignment/delete] storage remove:', rmErr.message)
                    return NextResponse.json({ error: 'De ingediende bestanden konden niet worden verwijderd. Er is niets verwijderd.' }, { status: 500 })
                }
                filesRemoved = paths.length
            }
        }

        // ── 2. The assignment; the cascade takes the rest ──────────────────────
        const { error: delErr } = await supabaseAdmin
            .from('assignments')
            .delete()
            .eq('id', assignmentId)
        if (delErr) {
            // The files are already gone here. Say so rather than pretend.
            console.error('[/api/assignment/delete] delete assignment:', delErr.message)
            return NextResponse.json(
                { error: `Het huiswerk kon niet worden verwijderd, maar ${filesRemoved} ingediende bestand(en) zijn al weg. Probeer opnieuw.` },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            submissionsDeleted: submissionIds.length,
            filesRemoved,
        })
    } catch (e: any) {
        console.error('[/api/assignment/delete]', e?.message ?? e)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
