'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const [email, setEmail]     = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent]       = useState(false)
    const [error, setError]     = useState('')

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError('')

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })

        if (error) {
            setError('Er liep iets mis. Controleer uw e-mailadres en probeer opnieuw.')
            setLoading(false)
            return
        }

        setSent(true)
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-surface-warm">
            <div className="w-full max-w-[380px]">
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                         style={{ backgroundColor: '#1B6B4A' }}>
                        <span className="text-white font-bold text-sm">م</span>
                    </div>
                    <span className="font-semibold text-gray-900">MasjidConnect</span>
                </div>

                {sent ? (
                    <div className="text-center">
                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={28} className="text-green-600"/>
                        </div>
                        <h1 className="text-xl font-semibold text-gray-900 mb-2">E-mail verzonden</h1>
                        <p className="text-gray-500 text-sm mb-6">
                            Controleer uw inbox op <strong>{email}</strong> en klik op de link om uw wachtwoord in te stellen.
                        </p>
                        <p className="text-xs text-gray-400 mb-6">
                            Geen mail ontvangen? Controleer uw spam of contacteer uw beheerder.
                        </p>
                        <Link href="/login" className="btn-primary w-full justify-center">
                            Terug naar inloggen
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="mb-8">
                            <h1 className="text-2xl font-semibold text-gray-900">Wachtwoord vergeten</h1>
                            <p className="text-gray-500 mt-1.5 text-sm">
                                Vul uw e-mailadres in en we sturen u een link om uw wachtwoord in te stellen.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="label">E-mailadres</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="naam@email.be"
                                    required
                                    autoComplete="email"
                                    className="input"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                                    {error}
                                </div>
                            )}

                            <button type="submit" disabled={loading || !email}
                                    className="btn-primary w-full justify-center h-11">
                                {loading
                                    ? <><Loader2 size={16} className="animate-spin"/> Bezig…</>
                                    : 'Reset link versturen'
                                }
                            </button>
                        </form>

                        <Link href="/login"
                              className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-6 transition-colors">
                            <ArrowLeft size={14}/> Terug naar inloggen
                        </Link>
                    </>
                )}
            </div>
        </div>
    )
}