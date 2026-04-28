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
        if (parsed.expires_at && parsed.expires_at * 1000 < Date.now()) return null
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
            setProfile(data)
            setLoading(false)
        }
        init()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') { setProfile(null); setLoading(false) }
            if (event === 'TOKEN_REFRESHED' && session?.user) {
                const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
                setProfile(data)
            }
        })
        return () => subscription.unsubscribe()
    }, [])

    return { profile, loading }
}