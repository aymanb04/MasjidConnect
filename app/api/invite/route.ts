import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service role client — enkel server-side
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { email, first_name, last_name, role, tenant_id, class_id, class_role, invited_by } = await request.json()

        // Nodig gebruiker uit via admin API
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { first_name, last_name, role, tenant_id },
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get('origin')}/reset-password`,
        })

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })

        // Schrijf naar invitations tabel zodat admin openstaande uitnodigingen kan zien
        if (invited_by) {
            await supabaseAdmin.from('invitations').insert({
                tenant_id,
                email,
                role,
                class_id: class_id || null,
                invited_by,
            })
        }

        // Wijs aan klas toe
        if (class_id && data.user) {
            if (class_role === 'student') {
                await supabaseAdmin.from('class_students').insert({
                    class_id, student_id: data.user.id
                })
            } else if (class_role === 'teacher') {
                await supabaseAdmin.from('class_teachers').insert({
                    class_id, teacher_id: data.user.id
                })
            }
        }

        return NextResponse.json({ success: true, user: data.user })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}