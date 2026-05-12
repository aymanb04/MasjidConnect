'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/lib/hooks/useProfile'
import { supabase } from '@/lib/supabase/singleton'
import Sidebar from '@/components/layout/Sidebar'
import type { Tenant } from '@/lib/types'
import { Menu } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { profile, loading } = useProfile()
    const router = useRouter()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [tenant, setTenant] = useState<Tenant | null>(null)

    useEffect(() => {
        if (!loading && !profile) {
            router.push('/login')
        }
    }, [loading, profile])

    useEffect(() => {
        if (profile?.tenant_id) {
            supabase.from('tenants').select('*').eq('id', profile.tenant_id).single()
                .then(({ data }) => setTenant(data))
        }
    }, [profile])

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
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — fixed overlay on mobile, static on desktop */}
            <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:translate-x-0 flex-shrink-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar profile={profile} tenant={tenant} onClose={() => setSidebarOpen(false)} />
            </div>

            <main className="flex-1 overflow-y-auto min-w-0">
                {/* Mobile top bar */}
                <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 md:hidden safe-area-top">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-1 -ml-1 text-gray-600 hover:text-gray-900"
                        aria-label="Menu openen"
                    >
                        <Menu size={20} />
                    </button>
                    <span className="font-semibold text-sm text-gray-900 truncate px-2">
                        {tenant?.name ?? 'MasjidConnect'}
                    </span>
                    <div className="w-7 flex-shrink-0" />
                </div>

                <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
