'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import type { Profile } from '@/lib/types'

function getStoredSession() {
    if (typeof window === 'undefined') return null
    try {
        const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL!.split('//')[1].split('.')[0]
        const raw = localStorage.getItem(`sb-${projectId}-auth-token`)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        // An expired access token is NOT "logged out": getSession() mints a new
        // one from the refresh token. Treating it as logged out made the layout
        // redirect to /login before that refresh could run (PWA re-login bug).
        if (!parsed.refresh_token) return null
        return parsed
    } catch { return null }
}

/**
 * Clear the session and leave for /login.
 *
 * A valid session whose profiles row is missing used to spin the app: the
 * dashboard layout pushes /login whenever `profile` is null, and /login pushes
 * authenticated visitors back to /dashboard — several redirects per second,
 * pinning the browser (hit 2026-08-11). It happens whenever an auth user
 * outlives its profile row, which is easy to cause: deleting a row in the
 * profiles table does NOT delete the auth user. Since the session is
 * unusable either way, drop it so the cycle cannot start.
 */
async function endSession(reason: string) {
    await supabase.auth.signOut()
    window.location.href = `/login?reden=${reason}`
}

type Loaded = { profile: Profile | null; fatal: string | null }

async function loadProfile(userId: string): Promise<Loaded> {
    // maybeSingle(), not single(): zero rows comes back as data=null/error=null,
    // which is how a genuinely missing profile stays distinguishable from a
    // transient query failure. single() reports both as an error, and signing a
    // user out on a network blip would be worse than the bug being fixed.
    const first = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (first.error) {
        const retry = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        if (retry.error) return { profile: null, fatal: 'profiel-onbereikbaar' }
        if (!retry.data) return { profile: null, fatal: 'geen-profiel' }
        return { profile: retry.data as Profile, fatal: null }
    }
    if (!first.data) return { profile: null, fatal: 'geen-profiel' }
    return { profile: first.data as Profile, fatal: null }
}

export function useProfile() {
    const stored = getStoredSession()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(!!stored)

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) { setLoading(false); return }
            const { profile: loaded, fatal } = await loadProfile(session.user.id)
            if (fatal) { await endSession(fatal); return }
            if (loaded?.is_active === false) { await endSession('gearchiveerd'); return }
            setProfile(loaded)
            setLoading(false)
        }
        init()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') { setProfile(null); setLoading(false) }
            if (event === 'TOKEN_REFRESHED' && session?.user) {
                // Deferred via setTimeout: awaiting a PostgREST call inside this
                // callback deadlocks supabase-js — the auth lock is held while
                // events are emitted, and .from() waits on that same lock.
                setTimeout(async () => {
                    const { profile: loaded, fatal } = await loadProfile(session.user.id)
                    if (fatal) { await endSession(fatal); return }
                    if (loaded?.is_active === false) { await endSession('gearchiveerd'); return }
                    setProfile(loaded)
                }, 0)
            }
        })
        return () => subscription.unsubscribe()
    }, [])

    return { profile, loading }
}
