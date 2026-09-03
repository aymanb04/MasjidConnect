/**
 * RLS smoke test — signs in as each demo role and asserts the documented
 * role/tenant boundaries hold. Read-only apart from two deliberately-denied
 * write attempts (both must fail).
 *
 * Run:  npx tsx scripts/rls-smoke.ts
 *
 * Needs `scripts/rls-smoke.accounts.json` (gitignored — contains demo
 * passwords) and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (read from .env.local if not set).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
    const p = join(root, '.env.local')
    if (!existsSync(p)) return
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
}
loadEnvLocal()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (set env or .env.local).')
    process.exit(2)
}

const accountsPath = join(root, 'scripts', 'rls-smoke.accounts.json')
if (!existsSync(accountsPath)) {
    console.error(`Missing ${accountsPath} — create it (gitignored) as:\n` +
        '{ "super_admin": {"email":"…","password":"…"}, "admin": {…}, "teacher": {…}, "student": {…} }')
    process.exit(2)
}
type Cred = { email: string; password: string }
// leerlingenbegeleiding is optional so an older accounts file still runs — but
// its checks then SKIP loudly rather than passing silently. That role was the
// one this file never covered, and it is exactly where the /api/terms/accept
// lockout hid (fixed 2026-08-26).
const accounts: Record<'super_admin' | 'admin' | 'teacher' | 'student', Cred>
    & Partial<Record<'leerlingenbegeleiding', Cred>> =
    JSON.parse(readFileSync(accountsPath, 'utf8'))

let passed = 0
let failed = 0
let skipped = 0
function check(name: string, ok: boolean, detail = '') {
    if (ok) { passed++; console.log(`  PASS  ${name}`) }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

function anonClient(): SupabaseClient {
    return createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signIn(cred: Cred): Promise<{ client: SupabaseClient; uid: string }> {
    const client = anonClient()
    const { data, error } = await client.auth.signInWithPassword(cred)
    if (error || !data.user) throw new Error(`Login failed for ${cred.email}: ${error?.message}`)
    return { client, uid: data.user.id }
}

/** RLS-denied reads come back as an empty 200, not an error — both count as hidden. */
async function assertHidden(client: SupabaseClient, table: string, label: string) {
    const { data, error } = await client.from(table).select('id').limit(5)
    check(label, !!error || (data ?? []).length === 0,
        error ? error.message : `got ${data?.length} rows`)
}

async function main() {
    console.log(`RLS smoke test against ${URL_}\n`)

    console.log('anon (not signed in):')
    const anon = anonClient()
    await assertHidden(anon, 'profiles', 'profiles hidden from anon')
    await assertHidden(anon, 'tenants', 'tenants hidden from anon')

    // Migration 26 / M-1: the SECURITY DEFINER helpers every RLS policy pivots on
    // were still EXECUTE-granted to PUBLIC, so anon could call them over
    // PostgREST with nothing but the publishable anon key.
    for (const fn of ['is_super_admin', 'get_my_role', 'get_my_tenant_id']) {
        const { error } = await anon.rpc(fn)
        check(`rpc ${fn}() not callable by anon`, !!error,
            'anon EXECUTE was not revoked — see migration 26 §8')
    }

    console.log('\nstudent:')
    const student = await signIn(accounts.student)
    {
        const { data, error } = await student.client.from('profiles').select('id, role').eq('id', student.uid)
        check('student reads own profile', !error && data?.length === 1 && data[0].role === 'student')

        for (const t of ['fee_payments', 'fee_config', 'staff_pay', 'payroll_entries',
            'student_notes', 'student_documents', 'invitations', 'audit_logs']) {
            await assertHidden(student.client, t, `${t} hidden from student`)
        }

        for (const t of ['test_scores', 'exam_scores', 'attendance_records']) {
            const { data, error } = await student.client.from(t).select('student_id').limit(200)
            check(`${t} rows are all the student's own`,
                !error && (data ?? []).every(r => r.student_id === student.uid),
                error?.message ?? (data ?? []).filter(r => r.student_id !== student.uid).length + ' foreign rows')
        }

        const { data: cards, error: cardsErr } = await student.client
            .from('rapport_cards').select('student_id, status').limit(50)
        check('rapport_cards: only own, only published',
            !cardsErr && (cards ?? []).every(c => c.student_id === student.uid && c.status === 'published'),
            cardsErr?.message ?? JSON.stringify((cards ?? []).filter(c => c.student_id !== student.uid || c.status !== 'published')))

        // Write attempts — every one of these must be refused.
        const { data: myClasses } = await student.client
            .from('class_students').select('class_id').eq('student_id', student.uid).limit(1)
        if (myClasses?.length) {
            const { error: insErr } = await student.client.from('exam_scores')
                .insert({ class_id: myClasses[0].class_id, student_id: student.uid, semester: 1, score: 20, max_score: 20 })
            check('student INSERT into exam_scores denied', !!insErr)
        } else {
            check('student INSERT into exam_scores denied', false, 'no class enrollment found to attempt with')
        }

        await student.client.from('profiles').update({ role: 'admin' }).eq('id', student.uid)
        const { data: after } = await student.client.from('profiles').select('role').eq('id', student.uid).single()
        check('student cannot escalate own role', after?.role === 'student', `role is now ${after?.role}`)
    }

    console.log('\nteacher:')
    const teacher = await signIn(accounts.teacher)
    {
        for (const t of ['fee_payments', 'fee_config', 'staff_pay', 'payroll_entries', 'invitations', 'audit_logs']) {
            await assertHidden(teacher.client, t, `${t} hidden from teacher`)
        }

        const { data: taught, error: taughtErr } = await teacher.client
            .from('class_teachers').select('class_id, teacher_id')
        const own = new Set((taught ?? []).filter(r => r.teacher_id === teacher.uid).map(r => r.class_id))
        check('teacher sees own class_teachers rows', !taughtErr && own.size > 0, taughtErr?.message ?? '0 classes')

        for (const t of ['exam_scores', 'class_tests']) {
            const { data, error } = await teacher.client.from(t).select('class_id').limit(200)
            check(`${t} scoped to classes the teacher teaches`,
                !error && (data ?? []).every(r => own.has(r.class_id)),
                error?.message ?? (data ?? []).filter(r => !own.has(r.class_id)).length + ' foreign rows')
        }
    }

    console.log('\nadmin:')
    const admin = await signIn(accounts.admin)
    {
        const { data: me } = await admin.client.from('profiles').select('tenant_id').eq('id', admin.uid).single()
        const myTenant = me?.tenant_id

        const { data: profs, error: profsErr } = await admin.client.from('profiles').select('tenant_id').limit(500)
        check('admin reads own-tenant profiles', !profsErr && (profs ?? []).length > 5, profsErr?.message ?? `${profs?.length} rows`)
        check('admin sees no foreign-tenant profiles',
            !profsErr && (profs ?? []).every(p => p.tenant_id === myTenant),
            `${(profs ?? []).filter(p => p.tenant_id !== myTenant).length} foreign rows`)

        const { error: feeErr } = await admin.client.from('fee_payments').select('id').limit(5)
        check('admin can read fee_payments', !feeErr, feeErr?.message)

        const { data: tenants, error: tenErr } = await admin.client.from('tenants').select('id')
        check('admin sees only own tenant', !tenErr && (tenants ?? []).every(t => t.id === myTenant),
            tenErr?.message ?? JSON.stringify(tenants))

        await assertHidden(admin.client, 'audit_logs', 'audit_logs hidden from admin')
    }

    console.log('\nleerlingenbegeleiding (counselor):')
    if (!accounts.leerlingenbegeleiding) {
        skipped += 4
        console.log('  SKIP  counselor checks — no "leerlingenbegeleiding" entry in rls-smoke.accounts.json')
        console.log('        (add one: this role was uncovered until 2026-08-26)')
    } else {
        const couns = await signIn(accounts.leerlingenbegeleiding)
        const { data: cme } = await couns.client.from('profiles').select('tenant_id').eq('id', couns.uid).single()
        const cTenant = cme?.tenant_id

        // The counselor's whole purpose: read dossiers across its own tenant.
        const { data: notes, error: notesErr } = await couns.client
            .from('student_notes').select('tenant_id').limit(200)
        check('counselor reads student_notes in own tenant',
            !notesErr && (notes ?? []).every(n => n.tenant_id === cTenant),
            notesErr?.message ?? `${(notes ?? []).filter(n => n.tenant_id !== cTenant).length} foreign rows`)

        // Explicitly NO access to money (migration 13 §"no payment tables").
        for (const t of ['fee_payments', 'fee_config', 'staff_pay', 'payroll_entries']) {
            await assertHidden(couns.client, t, `${t} hidden from counselor`)
        }

        // Migration 26 / M-3: teacher_manage_own_slots had no role check, so any
        // non-teacher could publish parent-teacher slots to the whole mosque.
        const { data: slot, error: slotErr } = await couns.client.from('oudercontact_slots')
            .insert({ tenant_id: cTenant, teacher_id: couns.uid, slot_date: '2099-01-01',
                      start_time: '10:00', end_time: '10:15' })
            .select('id').maybeSingle()
        check('counselor cannot create oudercontact slots', !!slotErr,
            slotErr ? '' : 'INSERT SUCCEEDED — migration 26 §5 has regressed')
        if (slot && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const svc = createClient(URL_!, process.env.SUPABASE_SERVICE_ROLE_KEY,
                { auth: { persistSession: false, autoRefreshToken: false } })
            await svc.from('oudercontact_slots').delete().eq('id', slot.id)
        }
    }

    console.log('\nsuper_admin:')
    // The super_admin password is rotated by hand from time to time, which used
    // to crash the whole run on the last two assertions and throw away the 31
    // that had already passed. A stale credential is a stale file, not an RLS
    // regression — skip and say so, and keep the exit code meaningful.
    let sa: Awaited<ReturnType<typeof signIn>> | null = null
    try {
        sa = await signIn(accounts.super_admin)
    } catch (e) {
        skipped += 2
        console.log(`  SKIP  super_admin checks — ${(e as Error).message}`)
        console.log('        (update the password in scripts/rls-smoke.accounts.json)')
    }
    if (sa) {
        const { data: tenants, error } = await sa.client.from('tenants').select('id')
        check('super_admin reads tenants', !error && (tenants ?? []).length >= 1, error?.message)
        const { error: auditErr } = await sa.client.from('audit_logs').select('id').limit(5)
        check('super_admin can read audit_logs', !auditErr, auditErr?.message)
    }

    // ── cross-tenant, empirically ────────────────────────────────────────────
    // Until 2026-08-15 this file could only assert isolation *structurally*,
    // because prod had one tenant. It now has two (De Kroon + De Kroon demo),
    // and that is what exposed migration 24: reads were correctly blocked while
    // WRITES were not — a demo-tenant student could insert an attendance session
    // into a real-tenant class it could not even SELECT. Assert both directions
    // here so the write side can never silently regress again.
    console.log('\ncross-tenant:')
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SERVICE) {
        skipped += 2
        console.log('  SKIP  cross-tenant checks — no SUPABASE_SERVICE_ROLE_KEY to locate a foreign tenant')
    } else {
        const svc = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
        const { data: me } = await svc.from('profiles').select('tenant_id').eq('id', student.uid).single()
        const { data: foreign } = await svc.from('classes')
            .select('id, tenant_id').neq('tenant_id', me!.tenant_id).limit(1).maybeSingle()
        const foreignTenant = foreign?.tenant_id

        if (!foreign) {
            skipped += 2
            console.log('  SKIP  cross-tenant checks — only one tenant in this database')
        } else {
            const { data: seen } = await student.client.from('classes').select('id').eq('id', foreign.id)
            check('foreign-tenant class not readable', (seen ?? []).length === 0, `saw ${seen?.length} rows`)

            const { data: wrote, error: wErr } = await student.client.from('attendance_sessions')
                .insert({ class_id: foreign.id, teacher_id: student.uid, session_date: '2099-01-01' })
                .select('id').maybeSingle()
            check('foreign-tenant attendance write denied', !!wErr,
                wErr ? '' : 'INSERT SUCCEEDED — migration 24 has regressed')
            // Only reachable if the check above failed; leave nothing behind either way.
            if (wrote) await svc.from('attendance_sessions').delete().eq('id', wrote.id)

            // ── migration 26 assertions ──────────────────────────────────────
            // H-1: announcements_delete's admin branch had NO tenant predicate,
            // so an admin of A could wipe every other mosque's announcements.
            // Probe on a row we create ourselves: if the hole is still open we
            // destroy only the probe, never real content.
            // announcements.created_by is NOT NULL with an FK to profiles, so the
            // original `created_by: null` made this insert fail every single time
            // and the check had never once run — it reported SKIP and looked
            // harmless. Borrow any profile from the foreign tenant instead.
            // (Fixed 2026-09-03, right after migration 26 was applied.)
            const { data: foreignAuthor } = await svc.from('profiles')
                .select('id').eq('tenant_id', foreignTenant).limit(1).maybeSingle()
            const { data: probe, error: probeErr } = foreignAuthor
                ? await svc.from('announcements')
                    .insert({ tenant_id: foreignTenant, title: 'rls-smoke probe',
                              content: 'delete me', created_by: foreignAuthor.id })
                    .select('id').maybeSingle()
                : { data: null, error: { message: 'no profile in the foreign tenant' } as any }
            if (!probe) {
                skipped += 1
                console.log(`  SKIP  foreign announcement delete — could not create probe row` +
                            `${probeErr ? ` (${probeErr.message})` : ''}`)
            } else {
                await admin.client.from('announcements').delete().eq('id', probe.id)
                const { data: still } = await svc.from('announcements').select('id').eq('id', probe.id)
                check('foreign-tenant announcement delete denied', (still ?? []).length === 1,
                    'DELETE SUCCEEDED — migration 26 §1 has regressed')
                await svc.from('announcements').delete().eq('id', probe.id)
            }

            // H-2: teacher_manage_docs was FOR ALL with an unscoped admin branch,
            // granting cross-tenant SELECT/UPDATE/DELETE on module_documents.
            // The same USING governs read and delete, so a read check proves it
            // without touching anyone's data.
            const { data: adminDocs, error: docsErr } = await admin.client
                .from('module_documents').select('module_id').limit(200)
            if (docsErr) {
                check('module_documents not readable cross-tenant', true)
            } else if ((adminDocs ?? []).length === 0) {
                skipped += 1
                console.log('  SKIP  module_documents scope — no rows in the database yet')
            } else {
                const { data: ownModules } = await admin.client.from('lesson_modules').select('id')
                const ownIds = new Set((ownModules ?? []).map(m => m.id))
                check('module_documents scoped to own tenant',
                    (adminDocs ?? []).every(d => ownIds.has(d.module_id)),
                    `${(adminDocs ?? []).filter(d => !ownIds.has(d.module_id)).length} foreign rows`)
            }

            // M-4: submission_files.file_url was unconstrained, so a student could
            // point a row on their OWN submission at another tenant's object and
            // have their teacher unwittingly fetch it.
            const { data: mySub } = await student.client
                .from('submissions').select('id').eq('student_id', student.uid).limit(1).maybeSingle()
            if (!mySub) {
                skipped += 1
                console.log('  SKIP  submission_files file_url pinning — student has no submission')
            } else {
                const { data: badRow, error: badErr } = await student.client.from('submission_files')
                    .insert({ submission_id: mySub.id, file_name: 'probe.pdf',
                              file_url: `${foreignTenant}/probe/stolen.pdf`,
                              file_size: 1, file_type: 'application/pdf' })
                    .select('id').maybeSingle()
                check('submission_files file_url pinned to own folder', !!badErr,
                    badErr ? '' : 'INSERT SUCCEEDED — migration 26 §3 has regressed')
                if (badRow) await svc.from('submission_files').delete().eq('id', badRow.id)
            }
        }
    }

    console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`)
    console.log('(Cross-tenant isolation is now asserted empirically against a real second tenant —')
    console.log(' keep the demo tenant: without it these two checks silently downgrade to a SKIP.)')
    process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
