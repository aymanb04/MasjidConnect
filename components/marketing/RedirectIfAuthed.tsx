'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'

// The landing page at `/` is public marketing, but the root URL is also what
// existing users have bookmarked. Sessions live in localStorage, so only the
// client can tell whether this visitor is logged in — a server-side getUser()
// here always saw null. Signed-in visitors get bounced to their dashboard;
// everyone else (including crawlers, which never carry a session) keeps the
// server-rendered marketing page.
export function RedirectIfAuthed() {
    const [redirecting, setRedirecting] = useState(false)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) return
            setRedirecting(true)
            window.location.replace('/dashboard')
        })
    }, [])

    if (!redirecting) return null

    // Covers the marketing page for the moment between "session found" and the
    // browser actually navigating, so bookmark users don't stare at a sales
    // pitch for their own school.
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: '#F8F7F4' }}
        >
            <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: '#1B6B4A', borderTopColor: 'transparent' }}
            />
        </div>
    )
}
