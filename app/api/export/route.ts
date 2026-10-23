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

// A tenant export is ~60 sequential reads. De Kroon took 3-11 s in October 2026
// (0.55 MB), which is too close to a default function timeout to leave implicit.
export const maxDuration = 60

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
    // Every read goes through fetchAll, which throws: a failed read used to be
    // skipped silently, and the person got an incomplete copy presented as whole.
    const put = (table: string, rows: any[]) => { if (rows.length) data[table] = rows }

    for (const { table, key } of [...OWNED_TABLES, ...SCRUBBED_TABLES, ...EXPORT_ONLY_TABLES]) {
        // student_details and staff_pay are keyed on the person and have no id column.
        put(table, await fetchAll(table, key, userId, { orderBy: table === 'student_details' || table === 'staff_pay' ? key : 'id' }))
    }

    // Erased by their own code in lib/gdpr-erasure.ts, because they point at files.
    put('student_documents',   await fetchAll('student_documents', 'student_id', userId))
    put('student_reports',     await fetchAll('student_reports', 'student_id', userId))
    const cards = (data.rapport_cards as any[] | undefined) ?? []
    if (cards.length) put('rapport_lines', await fetchAll('rapport_lines', 'rapport_card_id', cards.map(c => c.id)))

    // Submissions and the feedback on them: the pupil's own work.
    const subs = await fetchAll('submissions', 'student_id', userId)
    put('submissions', subs)
    const subIds = subs.map(s => s.id)
    if (subIds.length) put('submission_feedback', await fetchAll('submission_feedback', 'submission_id', subIds))

    // Files, as a manifest with one-hour download links.
    const files: FileEntry[] = []
    files.push(...await signAll('student-documents', ((data.student_documents as any[]) ?? []).map(d => d.file_url)))
    files.push(...await signAll('student-reports', ((data.student_reports as any[]) ?? []).map(r => r.file_url)))
    if (subIds.length) {
        const sf = await fetchAll('submission_files', 'submission_id', subIds)
        files.push(...await signAll('submission-files', sf.map(f => f.file_url)))
    }
    if (files.length) data.bestanden = files

    return data
}

// PostgREST returns at most 1000 rows per request and says nothing when it stops
// there: De Kroon's attendance_records (1215 rows in October 2026) came back as
// exactly 1000. So every read below pages until a short page, and a long id list
// is split so the IN (...) filter stays within URL limits.
const PAGE = 1000
const ID_CHUNK = 200

/** All rows of `table` where `col` equals / is in `match`. Throws on any error. */
async function fetchAll(
    table: string, col: string, match: string | string[],
    opts: { select?: string; orderBy?: string } = {},
): Promise<any[]> {
    const values = Array.isArray(match) ? match : [match]
    const rows: any[] = []
    for (let i = 0; i < values.length; i += ID_CHUNK) {
        const chunk = values.slice(i, i + ID_CHUNK)
        for (let from = 0; ; from += PAGE) {
            let q = supabaseAdmin.from(table).select(opts.select ?? '*')
            q = chunk.length === 1 ? q.eq(col, chunk[0]) : q.in(col, chunk)
            // A stable order, or pages can overlap or skip rows.
            const { data, error } = await q.order(opts.orderBy ?? 'id').range(from, from + PAGE - 1)
            if (error) throw new Error(`${table}: ${error.message}`)
            rows.push(...(data ?? []))
            if (!data || data.length < PAGE) break
        }
    }
    return rows
}

// Tables that carry tenant_id themselves. Two have no `id` column and are paged on
// their own key. Adding a tenant table to the schema? Add it here too: before
// 2026-10-21 this list stopped at 15 tables and the export left out the school's
// attendance, homework, grades and rapports without anyone noticing.
const TENANT_TABLES: { table: string; orderBy?: string; select?: string }[] = [
    { table: 'school_years' }, { table: 'groups' }, { table: 'classes' },
    { table: 'profiles' }, { table: 'announcements' }, { table: 'families' },
    { table: 'student_details', orderBy: 'student_id' }, { table: 'student_notes' },
    { table: 'student_documents' }, { table: 'student_reports' },
    { table: 'tenant_documents' }, { table: 'tenant_document_acks' },
    { table: 'fee_config' }, { table: 'fee_payments' }, { table: 'payments' },
    { table: 'payroll_entries' }, { table: 'staff_pay', orderBy: 'staff_id' },
    { table: 'grade_categories' }, { table: 'student_goals' }, { table: 'rapport_cards' },
    { table: 'calendar_events' }, { table: 'class_sessions' }, { table: 'oudercontact_slots' },
    { table: 'feedback' }, { table: 'audit_logs' },
    // The token is a live credential for an invitation not yet accepted.
    { table: 'invitations', select: 'id, tenant_id, email, role, class_id, invited_by, accepted_at, expires_at, created_at' },
]

/** Everything of one school — the exit export promised by DPA art. 11.2. */
async function exportTenant(tenantId: string) {
    const out: Record<string, unknown[]> = {}
    const put = (table: string, rows: any[]) => { out[table] = rows }
    const ids = (table: string) => (out[table] ?? []).map((r: any) => r.id as string)
    // An empty id list means there is nothing under it, not "fetch everything".
    const under = async (table: string, col: string, parent: string) => {
        const p = ids(parent)
        put(table, p.length ? await fetchAll(table, col, p) : [])
    }

    put('tenants', await fetchAll('tenants', 'id', tenantId))
    for (const t of TENANT_TABLES) {
        put(t.table, await fetchAll(t.table, 'tenant_id', tenantId, { orderBy: t.orderBy, select: t.select }))
    }

    // Reached through the school's classes.
    for (const table of ['class_students', 'class_teachers', 'assignments', 'lesson_modules',
                         'class_tests', 'exam_scores', 'attendance_sessions']) {
        await under(table, 'class_id', 'classes')
    }

    // One level further down.
    await under('assignment_students',   'assignment_id',   'assignments')
    await under('submissions',           'assignment_id',   'assignments')
    await under('submission_feedback',   'submission_id',   'submissions')
    await under('submission_files',      'submission_id',   'submissions')
    await under('attendance_records',    'session_id',      'attendance_sessions')
    await under('test_scores',           'test_id',         'class_tests')
    await under('rapport_lines',         'rapport_card_id', 'rapport_cards')
    await under('category_scores',       'category_id',     'grade_categories')
    await under('oudercontact_bookings', 'slot_id',         'oudercontact_slots')
    await under('module_documents',      'module_id',       'lesson_modules')

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
        // Read the body once. The tenant branch below used to re-read it with
        // request.clone(), which throws once the body is consumed, so a
        // super_admin tenant export had never once succeeded.
        const body = await request.json().catch(() => null)
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
        }
        const { scope, userId } = body

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
            // An admin always gets their own school, whatever the body says. A
            // super_admin has no tenant of their own (tenant_id is NULL), so they
            // must name one: falling back to theirs would export nothing and still
            // answer 200.
            let tenantId = caller.tenant_id
            if (caller.role === 'super_admin') {
                if (typeof body.tenantId !== 'string' || !body.tenantId) {
                    return NextResponse.json({ error: 'tenantId verplicht' }, { status: 400 })
                }
                const { data: t } = await supabaseAdmin
                    .from('tenants').select('id').eq('id', body.tenantId).maybeSingle()
                if (!t) return NextResponse.json({ error: 'School niet gevonden' }, { status: 404 })
                tenantId = body.tenantId
            }
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
