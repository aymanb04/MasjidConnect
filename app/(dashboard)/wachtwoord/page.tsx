'use client'

// Change your own password.
//
// Until now nobody could. The only call to updateUser({ password }) lived in
// /reset-password, which is reachable only through an e-mail recovery link — so
// a pupil handed an admin-generated password like "V6HsHtdhyBBA" kept it for
// good, and so did a teacher. That turns a starter credential into a life
// sentence, and a 12-character random string a child must memorise is a string
// that ends up written inside a pencil case.
//
// With this screen the admin-generated password becomes what it should be: a
// one-time starter the user replaces with something they can actually remember.
//
// The current password is required. Pupils use shared devices at the mosque, and
// without that check anyone who finds an unlocked session could lock the real
// owner out of their own account. Supabase's updateUser does not verify it, so
// we verify it ourselves by signing in with it first.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { KeyRound, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'

// Supabase rejects a password without a lowercase letter, an uppercase letter
// and a digit. Checking here rather than letting it come back as an English
// server error the user cannot act on.
function policyProblem(pw: string): string | null {
  if (pw.length < 8) return 'Gebruik minstens 8 tekens.'
  if (!/[a-z]/.test(pw)) return 'Gebruik minstens één kleine letter.'
  if (!/[A-Z]/.test(pw)) return 'Gebruik minstens één hoofdletter.'
  if (!/[0-9]/.test(pw)) return 'Gebruik minstens één cijfer.'
  return null
}

export default function WachtwoordPage() {
  const { profile, loading } = useProfile()
  const router = useRouter()

  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [repeat, setRepeat]   = useState('')
  const [show, setShow]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  if (loading) return <PageLoader />
  if (!profile) { router.replace('/login'); return null }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (next !== repeat) { setError('De twee nieuwe wachtwoorden zijn niet gelijk.'); return }
    const problem = policyProblem(next)
    if (problem) { setError(problem); return }
    if (next === current) { setError('Kies een ander wachtwoord dan je huidige.'); return }

    setSaving(true)

    // Verify the current password by using it. Same user, so the session it
    // returns simply replaces the one already held.
    const { data: { user } } = await supabase.auth.getUser()
    const { error: checkErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: current,
    })
    if (checkErr) {
      setError('Je huidige wachtwoord klopt niet.')
      setSaving(false)
      return
    }

    const { error: setErr } = await supabase.auth.updateUser({ password: next })
    if (setErr) {
      console.error('[wachtwoord]', setErr.message)
      setError('Wijzigen is niet gelukt. Probeer het opnieuw.')
      setSaving(false)
      return
    }

    setSaving(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="animate-slide-up max-w-md">
        <div className="card p-8 text-center">
          <span className="stat-icon mx-auto bg-primary-50">
            <CheckCircle2 size={22} className="text-primary-600" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-gray-900">Je wachtwoord is gewijzigd</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
            Gebruik vanaf nu je nieuwe wachtwoord om aan te melden. Je blijft hier
            gewoon ingelogd.
          </p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary mt-5 justify-center">
            Terug naar dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-slide-up max-w-md">
      <div className="page-header">
        <h1 className="page-title">Wachtwoord wijzigen</h1>
        <p className="page-subtitle">Kies iets dat je zelf kan onthouden</p>
      </div>

      <form onSubmit={submit} className="card p-6" noValidate>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="huidig" className="label">Huidig wachtwoord</label>
            <input id="huidig" type={show ? 'text' : 'password'} className="input"
              autoComplete="current-password" value={current}
              onChange={e => setCurrent(e.target.value)} />
          </div>

          <div>
            <label htmlFor="nieuw" className="label">Nieuw wachtwoord</label>
            <div className="relative">
              <input id="nieuw" type={show ? 'text' : 'password'} className="input pr-10"
                autoComplete="new-password" value={next}
                onChange={e => setNext(e.target.value)} />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                aria-label={show ? 'Verberg wachtwoord' : 'Toon wachtwoord'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Minstens 8 tekens, met een hoofdletter, een kleine letter en een cijfer.
            </p>
          </div>

          <div>
            <label htmlFor="herhaal" className="label">Nieuw wachtwoord herhalen</label>
            <input id="herhaal" type={show ? 'text' : 'password'} className="input"
              autoComplete="new-password" value={repeat}
              onChange={e => setRepeat(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
          )}

          <button type="submit" disabled={saving || !current || !next || !repeat}
            className="btn-primary h-11 justify-center">
            {saving
              ? <><Loader2 size={16} className="animate-spin" /> Opslaan…</>
              : <><KeyRound size={16} /> Wachtwoord wijzigen</>}
          </button>
        </div>
      </form>
    </div>
  )
}
