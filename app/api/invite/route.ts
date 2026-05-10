import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const {
            email, first_name, last_name, role, tenant_id,
            group_id,               // student → enroll in all classes of this group
            class_id, class_role,   // teacher → assign to this specific class
            invited_by,
        } = await request.json()

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { first_name, last_name, role, tenant_id },
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get('origin')}/reset-password`,
        })

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })

        if (invited_by) {
            await supabaseAdmin.from('invitations').insert({
                tenant_id, email, role,
                class_id: class_id || null,
                invited_by,
            })
        }

        if (data.user) {
            // Student: enroll in every class that belongs to the selected group
            if (group_id && role === 'student') {
                const { data: groupClasses } = await supabaseAdmin
                    .from('classes')
                    .select('id')
                    .eq('group_id', group_id)
                    .eq('is_archived', false)

                if (groupClasses?.length) {
                    await supabaseAdmin.from('class_students').insert(
                        groupClasses.map(c => ({ class_id: c.id, student_id: data.user!.id }))
                    )
                }
            }

            // Teacher: assign to a specific class
            if (class_id && class_role === 'teacher') {
                await supabaseAdmin.from('class_teachers').insert({
                    class_id, teacher_id: data.user.id,
                })
            }

            // Fallback: student assigned to a single class (no group)
            if (class_id && !group_id && class_role === 'student') {
                await supabaseAdmin.from('class_students').insert({
                    class_id, student_id: data.user.id,
                })
            }
        }

        return NextResponse.json({ success: true, user: data.user })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
