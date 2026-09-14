import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  OWNED_TABLES, SCRUBBED_TABLES, EXPORT_ONLY_TABLES, USER_BUCKETS,
} from '@/lib/personal-data-map'

// Data export — the mechanism behind three promises that had none.
//
//   · Art. 15 AVG: "u kunt opvragen welke gegevens wij over u bewaren, en
//     daarvan gratis een kopie krijgen"  (published on /legal/privacy)
//   · Art. 20 AVG: overdraagbaarheid — the copy must be structured, commonly
//     used and machine-readable, hence JSON
//   · verwerkersovereenkomst art. 11.2: the School may request an export within
//     30 days of termination — a contractual commitment as of 2026-09-13
//
// Until this route existed, all three were answered by the operator querying the
// database by hand, against a one-month legal deadline.
//
// TWO SCOPES, one code path:
//   scope=user    → everything about one person (a parent's request)
//   scope=tenant  → everything of one school (exit, art. 11.2)
//
// Files are NOT inlined. The response lists each file with a signed URL valid
// for one hour: a pupil's homework uploads can be hundreds of megabytes, and a
// JSON document with base64 blobs in it is not "commonly used" in any useful
// sense. The manifest is the machine-readable part; the URLs are how you fetch
// the bytes.

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SIGNED_URL_TTL = 60 * 60   // one hour

type FileEntry = { bucket: string; path: string; name: string; url: string | null }

async function signAll(bucket: string, paths: string[]): Promise<FileEntry[]> {
    if (!paths.length) return []
    const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL)
    return (data ?? []).map(d => ({
        bucket,
        path: d.path ?? '',
        name: (d.path ?? '').split('/').pop() ?? '',
        url: d.signedUrl ?? null,
    }))
}

/** Everything held about one person. */
async function exportUser(userId: string) {
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, tenant_id, role, first_name, last_name, email, phone, is_active, archived_at, terms_accepted_at, terms_version, created_at')
        .eq('id', userId)
        .single()
    if (!profile) return null

    const data: Record<string, unknown> = { profiel: profile }

    for (const { table, key } of [...OWNED_TABLES, ...SCRUBBED_TABLES, ...EXPORT_ONLY_TABLES]) {
        const { data: rows } = await supabaseAdmin.from(table).select('*').eq(key, userId)
        if (rows?.length) data[table] = rows
    }

    // Submissions and the feedback on them: the pupil's own work.
    const { data: subs } = await supabaseAdmin
        .from('submissions').select('*').eq('student_id', userId)
    if (subs?.length) {
        data.submissions = subs
        const ids = subs.map(s => s.id)
        const { data: fb } = await supabaseAdmin
            .from('submission_feedback').select('*').in('submission_id', ids)
        if (fb?.length) data.submission_feedback = fb
    }

    // Files, as a manifest with one-hour download links.
    const files: FileEntry[] = []
    const { data: docs } = await supabaseAdmin
        .from('student_documents').select('file_url').eq('student_id', userId)
    files.push(...await signAll('student-documents', (docs ?? []).map(d => d.file_url)))

    const { data: reps } = await supabaseAdmin
        .from('student_reports').select('file_url').eq('student_id', userId)
    files.push(...await signAll('student-reports', (reps ?? []).map(r => r.file_url)))

    if (subs?.length) {
        const { data: sf } = await supabaseAdmin
            .from('submission_files').select('file_url').in('submission_id', subs.map(s => s.id))
        files.push(...await signAll('submission-files', (sf ?? []).map(f => f.file_url)))
    }
    if (files.length) data.bestanden = files

    return data
}

/** Everything of one school — the exit export promised by DPA art. 11.2. */
async function exportTenant(tenantId: string) {
    const out: Record<string, unknown> = {}

    // Tenant-scoped tables, straightforwardly.
    for (const table of ['tenants', 'school_years', 'groups', 'classes', 'profiles',
                         'announcements', 'families', 'student_details', 'student_notes',
                         'student_documents', 'student_reports', 'tenant_documents',
                         'tenant_document_acks', 'fee_payments', 'fee_config'] as const) {
        const col = table === 'tenants' ? 'id' : 'tenant_id'
        const { data } = await supabaseAdmin.from(table).select('*').eq(col, tenantId)
        if (data?.length) out[table] = data
    }

    // Tables reached through the school's classes rather than carrying tenant_id.
    const { data: classes } = await supabaseAdmin
        .from('classes').select('id').eq('tenant_id', tenantId)
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length) {
        for (const table of ['class_students', 'class_teachers', 'assignments',
                             'lesson_modules', 'class_tests', 'exam_scores',
                             'attendance_sessions'] as const) {
            const { data } = await supabaseAdmin.from(table).select('*').in('class_id', classIds)
            if (data?.length) out[table] = data
        }
    }
    return out
}

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/export', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { scope, userId } = await request.json()

        if (scope === 'user') {
            if (!userId) return NextResponse.json({ error: 'userId verplicht' }, { status: 400 })

            const { data: target } = await supabaseAdmin
                .from('profiles').select('id, tenant_id').eq('id', userId).single()
            if (!target) return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
            // Own tenant only — an export is a complete dossier, so the tenant
            // check matters at least as much here as on a write route.
            if (caller.role === 'admin' && target.tenant_id !== caller.tenant_id) {
                return NextResponse.json({ error: 'Geen toegang tot deze gebruiker' }, { status: 403 })
            }

            const data = await exportUser(userId)
            console.info('[/api/export] user export by', caller.id, 'for', userId)
            return NextResponse.json({
                type: 'persoonsgegevens',
                gegenereerd_op: new Date().toISOString(),
                toelichting:
                    'Alle gegevens die MasjidConnect over deze persoon bewaart, in opdracht van de school. ' +
                    'Downloadlinks voor bestanden zijn één uur geldig.',
                data,
            })
        }

        if (scope === 'tenant') {
            const tenantId = caller.role === 'super_admin'
                ? ((await request.clone().json()).tenantId ?? caller.tenant_id)
                : caller.tenant_id
            const data = await exportTenant(tenantId)
            console.info('[/api/export] tenant export by', caller.id, 'for', tenantId)
            return NextResponse.json({
                type: 'schoolgegevens',
                gegenereerd_op: new Date().toISOString(),
                toelichting:
                    'Volledige export van de schoolgegevens (verwerkersovereenkomst art. 11.2). ' +
                    'Bestanden zitten niet in dit bestand; vraag die apart op.',
                data,
            })
        }

        return NextResponse.json({ error: "scope moet 'user' of 'tenant' zijn" }, { status: 400 })
    } catch (e: any) {
        console.error('[/api/export]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
