'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/lib/hooks/useProfile'
import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { profile, loading } = useProfile()
    const router = useRouter()

    useEffect(() => {
        if (!loading && !profile) {
            router.push('/login')
        }
    }, [loading, profile])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center" style={{ backgroundColor: '#F8F7F4' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#1B6B4A', borderTopColor: 'transparent' }} />
                    <p className="text-sm text-gray-500">Laden…</p>
                </div>
            </div>
        )
    }

    if (!profile) return null

    return (
        <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F7F4' }}>
            <Sidebar profile={profile} />
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto px-6 py-8">
                    {children}
                </div>
            </main>
        </div>
    )
}