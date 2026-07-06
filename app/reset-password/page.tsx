'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirm, setConfirm]   = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading]   = useState(false)
    const [done, setDone]         = useState(false)
    const [error, setError]       = useState('')
    const [ready, setReady]       = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Verwerk de token uit de URL hash direct
        const hash = window.location.hash
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1))
            const accessToken  = params.get('access_token')
            const refreshToken = params.get('refresh_token')

            if (accessToken && refreshToken) {
                supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                }).then(({ error }) => {
                    if (error) {
                        setError('Ongeldige of verlopen reset link. Vraag een nieuwe aan.')
                    } else {
                        setReady(true)
                    }
                })
                return
            }
        }

        // Fallback: luister naar PASSWORD_RECOVERY event
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setReady(true)
            }
        })

        // Als na 5 seconden nog niks: toon foutmelding
        const timeout = setTimeout(() => {
            if (!ready) {
                setError('Ongeldige of verlopen reset link. Vraag een nieuwe aan via "Wachtwoord vergeten".')
            }
        }, 5000)

        return () => {
            subscription.unsubscribe()
            clearTimeout(timeout)
        }
    }, [])

    async function handleReset(e: React.FormEvent) {
        e.preventDefault()
        if (password !== confirm) { setError('Wachtwoorden komen niet overeen.'); return }
        if (password.length < 10) { setError('Wachtwoord moet minstens 10 tekens bevatten.'); return }
        if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
            setError('Wachtwoord moet minstens één cijfer en één letter bevatten.')
            return
        }

        setLoading(true)
        setError('')

        const { error } = await supabase.auth.updateUser({ password })

        if (error) {
            setError('Er liep iets mis: ' + error.message)
            setLoading(false)
            return
        }

        // Mark invitation as accepted
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser?.email) {
          await supabase.from('invitations')
            .update({ accepted_at: new Date().toISOString() })
            .eq('email', currentUser.email)
            .is('accepted_at', null)
        }

        setDone(true)
        setTimeout(() => router.push('/dashboard'), 2000)
    }

    // Laadscherm
    if (!ready && !error) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-surface-warm">
                <div className="text-center">
                    <Loader2 size={24} className="animate-spin mx-auto mb-3" style={{ color: '#1B6B4A' }}/>
                    <p className="text-sm text-gray-500">Bezig met verificatie…</p>
                </div>
            </div>
        )
    }

    // Foutscherm (verlopen link)
    if (error && !ready) {
        return (
            <div className="min-h-dvh flex items-center justify-center p-8 bg-surface-warm">
                <div className="w-full max-w-[380px] text-center">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Link ongeldig</h1>
                    <p className="text-gray-500 text-sm mb-6">{error}</p>
                    <a href="/forgot-password" className="btn-primary w-full justify-center">
                        Nieuwe reset link aanvragen
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-dvh flex items-center justify-center p-8 bg-surface-warm">
            <div className="w-full max-w-[380px]">
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B6B4A' }}>
                        <span className="text-white font-bold text-sm">م</span>
                    </div>
                    <span className="font-semibold text-gray-900">MasjidConnect</span>
                </div>

                {done ? (
                    <div className="text-center">
                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={28} className="text-green-600"/>
                        </div>
                        <h1 className="text-xl font-semibold text-gray-900 mb-2">Wachtwoord ingesteld</h1>
                        <p className="text-gray-500 text-sm">U wordt automatisch doorgestuurd…</p>
                    </div>
                ) : (
                    <>
                        <div className="mb-8">
                            <h1 className="text-2xl font-semibold text-gray-900">Nieuw wachtwoord</h1>
                            <p className="text-gray-500 mt-1.5 text-sm">Minstens 10 tekens, met een cijfer en een letter.</p>
                        </div>

                        <form onSubmit={handleReset} className="space-y-4">
                            <div>
                                <label className="label">Nieuw wachtwoord</label>
                                <div className="relative">
                                    <input type={showPass ? 'text' : 'password'} value={password}
                                           onChange={e => setPassword(e.target.value)}
                                           placeholder="Minstens 10 tekens" required className="input pr-10"/>
                                    <button type="button" onClick={() => setShowPass(!showPass)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="label">Bevestig wachtwoord</label>
                                <input type="password" value={confirm}
                                       onChange={e => setConfirm(e.target.value)}
                                       placeholder="Herhaal wachtwoord" required className="input"/>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
                            )}

                            <button type="submit" disabled={loading || !password || !confirm}
                                    className="btn-primary w-full justify-center h-11">
                                {loading
                                    ? <><Loader2 size={16} className="animate-spin"/> Opslaan…</>
                                    : 'Wachtwoord opslaan'
                                }
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}