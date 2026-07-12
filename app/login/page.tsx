'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { MeemMark } from '@/components/ui/MeemMark'
import { cn } from '@/lib/utils'
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Already-authenticated visitors (e.g. bounced here while their token was
  // still refreshing) go straight to the dashboard instead of re-entering
  // their password.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = '/dashboard'
    })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Ongeldig e-mailadres of wachtwoord. Probeer opnieuw.')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-dvh flex">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col" style={{ backgroundColor: '#1B6B4A' }}>
        <div className="absolute inset-0 pattern-bg" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.10)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
        <div className="relative z-10 flex flex-col h-full p-12 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <MeemMark className="text-white" size={28} />
            </div>
            <span className="text-white font-semibold text-lg">MasjidConnect</span>
          </div>
          <div className="text-white">
            <div className="text-5xl font-bold leading-tight mb-4">Digitaal<br />onderwijs voor<br />uw moskee</div>
            <p className="text-lg leading-relaxed max-w-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Huiswerk, lesmodules en leerlingenopvolging — alles op één plek.
            </p>
            <div className="flex flex-wrap gap-2 mt-8">
              {['Huiswerk & deadlines', 'Taken uploaden', 'Lesmodules', 'Meerdere klassen'].map(f => (
                <span key={f} className="px-3 py-1.5 rounded-full text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>{f}</span>
              ))}
            </div>
          </div>
          <div className="text-right" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <div className="text-sm font-arabic">طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ</div>
            <div className="text-xs mt-1 font-sans" style={{ color: 'rgba(255,255,255,0.3)' }}>"Het zoeken naar kennis is een plicht voor elke moslim."</div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-surface-warm">
        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B6B4A' }}>
              <MeemMark className="text-white" />
            </div>
            <span className="font-semibold text-gray-900">MasjidConnect</span>
          </div>
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Welkom terug</h1>
            <p className="text-gray-500 mt-1.5 text-sm">Log in op uw account om door te gaan.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">E-mailadres</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="naam@moskee.be" required autoComplete="email"
                className={cn('input', error && 'border-red-400')} />
            </div>
            <div>
              <label className="label" htmlFor="password">Wachtwoord</label>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  autoComplete="current-password" className={cn('input pr-10', error && 'border-red-400')} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-red-500 text-xs">⚠</span>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading || !email || !password} className="btn-primary w-full justify-center h-11 mt-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Bezig met inloggen…</> : 'Inloggen'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-5">
            Wachtwoord vergeten?{' '}
            <Link href="/forgot-password" className="font-medium hover:underline" style={{ color: '#1B6B4A' }}>
              Reset via e-mail
            </Link>
          </p>
          <p className="text-center text-xs text-gray-400 mt-8">© {new Date().getFullYear()} MasjidConnect · Alle rechten voorbehouden</p>
        </div>
      </div>
    </div>
  )
}
