'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'

// Sessions live in localStorage, so only the client can know whether the
// visitor is logged in — a server-side getUser() here always saw null.
export default function RootPage() {
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            window.location.replace(session ? '/dashboard' : '/login')
        })
    }, [])

    return (
        <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: '#F8F7F4' }}>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#1B6B4A', borderTopColor: 'transparent' }} />
        </div>
    )
}
