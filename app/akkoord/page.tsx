'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/lib/hooks/useProfile'
import { MeemMark } from '@/components/ui/MeemMark'
import { supabase } from '@/lib/supabase/singleton'
import { needsTermsAcceptance, isAcknowledgementOnly } from '@/lib/terms'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { VoorwaardenContent } from '@/components/legal/VoorwaardenContent'
import { Loader2 } from 'lucide-react'

export default function AkkoordPage() {
    const { profile, loading } = useProfile()
    const router = useRouter()
    const [checked, setChecked] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // A pupil is a minor and cannot validly sign a contract; the school is the
    // licensee and accepts on their behalf. They confirm they have read the
    // rules instead. Staff still accept. See lib/terms.ts.
    const ackOnly = isAcknowledgementOnly(profile?.role)

    useEffect(() => {
        if (loading) return
        if (!profile) { router.replace('/login'); return }
        if (!needsTermsAcceptance(profile)) { router.replace('/dashboard') }
    }, [loading, profile])

    async function accept() {
        if (!profile || !checked) return
        setSaving(true)
        setError('')

        // Write goes through an API route with the service role: the
        // update_own_profile RLS policy recurses on a client-side self-update,
        // so the client cannot write its own profile directly.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            setError('Je sessie is verlopen. Log opnieuw in.')
            setSaving(false)
            return
        }

        const res = await fetch('/api/terms/accept', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (!res.ok) {
            setError('Er liep iets mis bij het opslaan. Probeer het opnieuw.')
            setSaving(false)
            return
        }
        router.replace('/dashboard')
    }

    async function logout() {
        await supabase.auth.signOut()
        router.replace('/login')
    }

    // While loading, or while a redirect (no profile / already accepted) is in flight.
    if (loading || !profile || !needsTermsAcceptance(profile)) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#F8F7F4' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: '#1B6B4A' }} />
            </div>
        )
    }

    return (
        <div className="min-h-dvh px-4 py-8 sm:py-12" style={{ backgroundColor: '#F8F7F4' }}>
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B6B4A' }}>
                        <MeemMark className="text-white" />
                    </div>
                    <span className="font-semibold text-gray-900">MasjidConnect</span>
                </div>

                <h1 className="text-2xl font-semibold text-gray-900">Voorwaarden en privacy</h1>
                <p className="text-gray-500 mt-1.5 text-sm mb-6">
                    {ackOnly
                        ? 'Hieronder staan de regels van MasjidConnect en wat er met jouw gegevens gebeurt. Je school heeft de voorwaarden aanvaard; wij vragen je alleen te bevestigen dat je ze gelezen hebt.'
                        : 'Lees onderstaande voorwaarden en onze privacyverklaring. Om MasjidConnect te gebruiken, vragen wij je deze te aanvaarden.'}
                </p>

                {/* Privacy */}
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Privacyverklaring</h2>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 mb-6">
                    <PrivacyContent />
                </div>

                {/* Voorwaarden */}
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Gebruiksvoorwaarden</h2>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 mb-6">
                    <VoorwaardenContent />
                </div>

                {/* Acceptance */}
                <label className="flex items-start gap-3 card p-4 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => setChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary-600"
                    />
                    <span className="text-sm text-gray-700">
                        {ackOnly ? (
                            <>Ik heb de <strong>privacyverklaring</strong> en de{' '}
                            <strong>regels</strong> van MasjidConnect gelezen.</>
                        ) : (
                            <>Ik heb de <strong>privacyverklaring</strong> gelezen en ga akkoord met de{' '}
                            <strong>gebruiksvoorwaarden</strong> van MasjidConnect.</>
                        )}
                    </span>
                </label>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
                )}

                <div className="mt-6 flex items-center justify-between gap-4">
                    <button
                        onClick={logout}
                        className="text-sm text-gray-500 hover:text-gray-700"
                    >
                        Uitloggen
                    </button>
                    <button
                        onClick={accept}
                        disabled={!checked || saving}
                        className="btn-primary justify-center h-11 px-6"
                    >
                        {saving
                            ? <><Loader2 size={16} className="animate-spin" /> Opslaan…</>
                            : ackOnly ? 'Gelezen en doorgaan' : 'Akkoord en doorgaan'
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}
