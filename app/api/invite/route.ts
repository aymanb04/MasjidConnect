import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
            invited_by,
        } = await request.json()

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
            const { data: group } = await supabaseAdmin
                .from('groups').select('tenant_id').eq('id', group_id).single()
            if (!group || group.tenant_id !== tenant_id) {
                return NextResponse.json({ error: 'Geen toegang tot deze groep' }, { status: 403 })
            }
        }
        if (class_id) {
            const { data: klas } = await supabaseAdmin
                .from('classes').select('tenant_id').eq('id', class_id).single()
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
            return NextResponse.json({ error: 'Uitnodiging kon niet worden verzonden.' }, { status: 400 })
        }

        if (invited_by) {
            await supabaseAdmin.from('invitations').insert({
                tenant_id, email, role,
                class_id: class_id || null,
                invited_by,
            })
        }

        if (data.user) {
            // Enrollment writes use upsert with ignoreDuplicates so concurrent CSV
            // imports / double-clicks cannot create duplicate junction rows.
            // Relies on the UNIQUE constraints (class_id, student_id) on
            // class_students and (class_id, teacher_id) on class_teachers.

            // Student: enroll in every class that belongs to the selected group
            if (group_id && role === 'student') {
                const { data: groupClasses } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('group_id', group_id)
                    .eq('is_archived', false)

                if (groupClasses?.length) {
                    await supabaseAdmin.from('class_students').upsert(
                        groupClasses.map(c => ({ class_id: c.id, student_id: data.user!.id })),
                        { onConflict: 'class_id,student_id', ignoreDuplicates: true }
                    )
                }
            }

            // Teacher: assign to all classes in a group
            if (group_id && role === 'teacher') {
                const { data: groupClasses } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('group_id', group_id)
                    .eq('is_archived', false)

                if (groupClasses?.length) {
                    await supabaseAdmin.from('class_teachers').upsert(
                        groupClasses.map(c => ({ class_id: c.id, teacher_id: data.user!.id })),
                        { onConflict: 'class_id,teacher_id', ignoreDuplicates: true }
                    )
                }
            }

            // Teacher: assign to a specific class (no group selected)
            if (class_id && !group_id && class_role === 'teacher') {
                await supabaseAdmin.from('class_teachers').upsert(
                    { class_id, teacher_id: data.user.id },
                    { onConflict: 'class_id,teacher_id', ignoreDuplicates: true }
                )
            }

            // Fallback: student assigned to a single class (no group)
            if (class_id && !group_id && class_role === 'student') {
                await supabaseAdmin.from('class_students').upsert(
                    { class_id, student_id: data.user.id },
                    { onConflict: 'class_id,student_id', ignoreDuplicates: true }
                )
            }
        }

        return NextResponse.json({ success: true, user: data.user })
    } catch (e: any) {
        console.error('[/api/invite]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
