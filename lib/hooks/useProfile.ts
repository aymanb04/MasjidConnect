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

export function useProfile() {
    const stored = getStoredSession()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(!!stored)

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) { setLoading(false); return }
            const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
            if (data?.is_active === false) {
                await supabase.auth.signOut()
                window.location.href = '/login'
                return
            }
            setProfile(data)
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
                    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
                    if (data?.is_active === false) {
                        await supabase.auth.signOut()
                        window.location.href = '/login'
                        return
                    }
                    setProfile(data)
                }, 0)
            }
        })
        return () => subscription.unsubscribe()
    }, [])

    return { profile, loading }
}