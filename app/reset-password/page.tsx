'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { MeemMark } from '@/components/ui/MeemMark'
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
    // Gescheiden van `error`: dat is voor formulierfouten (wachtwoord te kort,
    // komt niet overeen). Eén gedeelde state liet een verlopen-link-melding in
    // het formulier opduiken terwijl de gebruiker aan het typen was.
    const [linkError, setLinkError] = useState<'expired' | 'invalid' | null>(null)
    const router = useRouter()

    useEffect(() => {
        // `settled` is een closure-variabele, geen state: de timeout hieronder las
        // anders altijd de beginwaarde van `ready` (lege deps) en zette een fout
        // op een reset die net wél gelukt was.
        let settled = false
        const finish = (fn: () => void) => { if (!settled) { settled = true; fn() } }

        const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const query = new URLSearchParams(window.location.search)

        // Een dode link komt terug ZONDER access_token, met de reden in de hash
        // (of query, afhankelijk van de flow): #error=access_denied&error_code=
        // otp_expired. Dit eerst afhandelen, anders valt zo'n link in de fallback
        // hieronder en blijft de gebruiker 5 seconden naar een spinner kijken.
        const errorCode = hash.get('error_code') ?? query.get('error_code')
        const errorKind = hash.get('error') ?? query.get('error')
        if (errorCode || errorKind) {
            finish(() => setLinkError(errorCode === 'otp_expired' ? 'expired' : 'invalid'))
            return
        }

        // Verwerk de token uit de URL hash direct
        const accessToken  = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
            supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            }).then(({ error }) => finish(() => {
                if (error) setLinkError('invalid')
                else setReady(true)
            }))
            return
        }

        // Fallback: luister naar PASSWORD_RECOVERY event
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') finish(() => setReady(true))
        })

        // Als na 5 seconden nog niks: toon foutmelding
        const timeout = setTimeout(() => finish(() => setLinkError('invalid')), 5000)

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
    if (!ready && !linkError) {
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
    if (linkError && !ready) {
        const expired = linkError === 'expired'
        return (
            <div className="min-h-dvh flex items-center justify-center p-8 bg-surface-warm">
                <div className="w-full max-w-[380px] text-center">
                    <div className={`w-14 h-14 ${expired ? 'bg-amber-100' : 'bg-red-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                        <span className="text-2xl">{expired ? '⏳' : '⚠️'}</span>
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">
                        {expired ? 'Link verlopen' : 'Link ongeldig'}
                    </h1>
                    <p className="text-gray-500 text-sm mb-6">
                        {expired
                            ? 'Deze link is verlopen, of er is intussen een nieuwere link verstuurd. Vraag hieronder een nieuwe aan — die kunt u meteen gebruiken.'
                            : 'We konden deze link niet verifiëren. Vraag een nieuwe aan via "Wachtwoord vergeten".'}
                    </p>
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
                        <MeemMark className="text-white" />
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