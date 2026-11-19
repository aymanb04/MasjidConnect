import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const VALID_ROLES = ['student', 'teacher', 'admin', 'leerlingenbegeleiding']
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
    const auth = await requireRole(request, ['admin', 'super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/invite', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const {
            email, first_name, last_name, role, tenant_id,
            group_id,               // student → enroll in all classes of this group
            class_id, class_role,   // teacher → assign to this specific class
        } = await request.json()

        // invited_by is deliberately NOT read from the body: it is an audit
        // field, and taking it from the caller's verified token means it cannot
        // be spoofed to blame someone else for an invite.
        const invited_by = caller.id

        if (!VALID_ROLES.includes(role)) {
            return NextResponse.json({ error: 'Ongeldig rol' }, { status: 400 })
        }

        if (!EMAIL_RE.test(email ?? '')) {
            return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
        }

        if (!first_name?.trim() || first_name.length > 100) {
            return NextResponse.json({ error: 'Ongeldige voornaam (max 100 tekens)' }, { status: 400 })
        }
        if (!last_name?.trim() || last_name.length > 100) {
            return NextResponse.json({ error: 'Ongeldige achternaam (max 100 tekens)' }, { status: 400 })
        }

        // Admins can only create users in their own tenant
        if (caller.role === 'admin' && tenant_id !== caller.tenant_id) {
            return NextResponse.json({ error: 'Geen toegang tot deze moskee' }, { status: 403 })
        }

        // group_id/class_id are used below with the service-role client (bypasses
        // RLS), so verify they belong to the target tenant — otherwise an admin
        // could enroll users into another mosque's classes.
        if (group_id) {
            const { data: group, error: groupErr } = await supabaseAdmin
                .from('groups').select('tenant_id').eq('id', group_id).maybeSingle()
            if (groupErr) throw groupErr
            if (!group || group.tenant_id !== tenant_id) {
                return NextResponse.json({ error: 'Geen toegang tot deze groep' }, { status: 403 })
            }
        }
        if (class_id) {
            const { data: klas, error: klasErr } = await supabaseAdmin
                .from('classes').select('tenant_id').eq('id', class_id).maybeSingle()
            if (klasErr) throw klasErr
            if (!klas || klas.tenant_id !== tenant_id) {
                return NextResponse.json({ error: 'Geen toegang tot deze klas' }, { status: 403 })
            }
        }

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { first_name, last_name, role, tenant_id },
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get('origin')}/reset-password`,
        })

        if (error) {
            console.error('[/api/invite] inviteUserByEmail:', error.message)
            // "Uitnodiging kon niet worden verzonden" reads as a mail problem, but
            // this branch fires for ANY GoTrue failure — including a database error
            // from the handle_new_user trigger. On 2026-08-13 that cost an evening:
            // the real cause was profiles.role being varchar(20) while
            // 'leerlingenbegeleiding' is 21 chars (fixed in migration 23), and the
            // message pointed at e-mail delivery instead. Name the two causes we can
            // recognise; everything else stays generic on purpose (no address
            // enumeration, no raw GoTrue text leaked to the client).
            const exists = /already( been)? registered|already exists|duplicate/i.test(error.message)
            const dbFault = /database error|value too long|violates/i.test(error.message)
            return NextResponse.json(
                {
                    error: exists
                        ? 'Dit e-mailadres heeft al een account. Eén adres kan maar één account (en één rol) hebben — gebruik een ander adres, of wijzig de rol van het bestaande account via Beheer.'
                        : dbFault
                            ? 'De uitnodiging kon niet worden opgeslagen (databasefout). Dit ligt niet aan het e-mailadres — meld dit even, dan wordt het nagekeken.'
                            : 'Uitnodiging kon niet worden verzonden.',
                },
                { status: 400 }
            )
        }

        // From here on the account EXISTS, so a failure below must not turn into
        // an error response: the admin would retry and hit "heeft al een account".
        // Each failed step is logged and named in a `warning` the form shows.
        const failed: string[] = []
        const note = (step: string, err: { message: string } | null) => {
            if (!err) return
            console.error(`[/api/invite] ${step}:`, err.message)
            failed.push(step)
        }

        const { error: invErr } = await supabaseAdmin.from('invitations').insert({
            tenant_id, email, role,
            class_id: class_id || null,
            invited_by,
        })
        note('invitations insert', invErr)   // audit trail only; the user is not affected

        if (data.user) {
            // Enrollment writes use upsert with ignoreDuplicates so concurrent CSV
            // imports / double-clicks cannot create duplicate junction rows.
            // Relies on the UNIQUE constraints (class_id, student_id) on
            // class_students and (class_id, teacher_id) on class_teachers.

            // Student: enroll in every class that belongs to the selected group
            if (group_id && role === 'student') {
                const { data: groupClasses, error: gcErr } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('group_id', group_id)
                    .eq('is_archived', false)
                note('klassen van de groep lezen', gcErr)

                if (groupClasses?.length) {
                    note('inschrijven in klas', (await supabaseAdmin.from('class_students').upsert(
                        groupClasses.map(c => ({ class_id: c.id, student_id: data.user!.id })),
                        { onConflict: 'class_id,student_id', ignoreDuplicates: true }
                    )).error)
                }
            }

            // Teacher: assign to all classes in a group
            if (group_id && role === 'teacher') {
                const { data: groupClasses, error: gcErr } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('group_id', group_id)
                    .eq('is_archived', false)
                note('klassen van de groep lezen', gcErr)

                if (groupClasses?.length) {
                    note('inschrijven in klas', (await supabaseAdmin.from('class_teachers').upsert(
                        groupClasses.map(c => ({ class_id: c.id, teacher_id: data.user!.id })),
                        { onConflict: 'class_id,teacher_id', ignoreDuplicates: true }
                    )).error)
                }
            }

            // Teacher: assign to a specific class (no group selected)
            if (class_id && !group_id && class_role === 'teacher') {
                note('inschrijven in klas', (await supabaseAdmin.from('class_teachers').upsert(
                    { class_id, teacher_id: data.user.id },
                    { onConflict: 'class_id,teacher_id', ignoreDuplicates: true }
                )).error)
            }

            // Fallback: student assigned to a single class (no group)
            if (class_id && !group_id && class_role === 'student') {
                note('inschrijven in klas', (await supabaseAdmin.from('class_students').upsert(
                    { class_id, student_id: data.user.id },
                    { onConflict: 'class_id,student_id', ignoreDuplicates: true }
                )).error)
            }
        }

        return NextResponse.json({
            success: true,
            user: data.user,
            ...(failed.some(f => f !== 'invitations insert') && {
                warning: 'Het account is aangemaakt, maar het inschrijven in de klas(sen) is mislukt. Voeg de klassen toe via Beheer → het potloodje bij deze persoon.',
            }),
        })
    } catch (e: any) {
        console.error('[/api/invite]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
