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
const accounts: Record<'super_admin' | 'admin' | 'teacher' | 'student', Cred> =
    JSON.parse(readFileSync(accountsPath, 'utf8'))

let passed = 0
let failed = 0
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

    console.log('\nsuper_admin:')
    const sa = await signIn(accounts.super_admin)
    {
        const { data: tenants, error } = await sa.client.from('tenants').select('id')
        check('super_admin reads tenants', !error && (tenants ?? []).length >= 1, error?.message)
        const { error: auditErr } = await sa.client.from('audit_logs').select('id').limit(5)
        check('super_admin can read audit_logs', !auditErr, auditErr?.message)
    }

    console.log(`\n${passed} passed, ${failed} failed`)
    console.log('(Note: demo DB has a single tenant — cross-tenant isolation is asserted structurally, not empirically.)')
    process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
