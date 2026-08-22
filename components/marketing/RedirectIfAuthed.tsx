'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'

// The landing page at `/` is public marketing, but the root URL is also what
// existing users have bookmarked. Sessions live in localStorage, so only the
// client can tell whether this visitor is logged in — a server-side getUser()
// here always saw null. Signed-in visitors get bounced to their dashboard;
// everyone else (including crawlers, which never carry a session) keeps the
// server-rendered marketing page.
// Now only a BACKSTOP. The redirect normally happens before paint, in the inline
// script in app/layout.tsx; this catches the case where that script found no
// storage key but supabase-js still resolves a session (custom storageKey, a
// migrated token shape). Reaching here means the marketing page was already
// shown, which is the thing the inline script exists to prevent.
//
// It renders nothing. The old version returned a full-screen spinner, but that
// never painted once: setRedirecting() and location.replace() ran in the same
// tick, so the browser started navigating before React committed. Measured
// `overlay shown: never` across every run.
export function RedirectIfAuthed() {
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) window.location.replace('/dashboard')
        })
    }, [])

    return null
}
