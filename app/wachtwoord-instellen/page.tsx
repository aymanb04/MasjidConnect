'use client'

// The forced first-login step (migration 37).
//
// 105 pupils were handed a system-generated starter password on a printed sheet
// that goes round a classroom. Until somebody replaces it, that sheet IS the
// password. Asking them to find Profiel > Wachtwoord by themselves does not
// work for a nine-year-old, so the app asks instead — and does not let them
// past until it is done.
//
// A top-level route, outside the dashboard layout, for the same reason /akkoord
// is: the layout redirects here, so a page inside it would loop.
//
// Tone: this is the second screen a child ever sees. Short sentences, say why,
// and no jargon.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { MeemMark } from '@/components/ui/MeemMark'
import { policyProblem, clearMustChangePassword } from '@/lib/password'
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react'

export default function WachtwoordInstellenPage() {
  const { profile, loading } = useProfile()
  const router = useRouter()

  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [repeat, setRepeat]   = useState('')
  const [show, setShow]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center" style={{ backgroundColor: '#F8F7F4' }}>
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }
  if (!profile) { router.replace('/login'); return null }
  // Already done — nothing to force. Someone reaching this URL by hand just goes back.
  if (!profile.must_change_password) { router.replace('/dashboard'); return null }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (next !== repeat) { setError('De twee nieuwe wachtwoorden zijn niet gelijk.'); return }
    const problem = policyProblem(next)
    if (problem) { setError(problem); return }
    if (next === current) { setError('Kies een ander wachtwoord dan het wachtwoord dat je kreeg.'); return }

    setSaving(true)

    // Verify the starter password by using it. Pupils share devices at the
    // mosque; without this anyone who finds an unlocked session could lock the
    // real owner out. Supabase's updateUser does not check it for us.
    const { data: { user } } = await supabase.auth.getUser()
    const { error: checkErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: current,
    })
    if (checkErr) {
      setError('Het wachtwoord dat je kreeg klopt niet. Kijk het blad van je leerkracht nog eens na.')
      setSaving(false)
      return
    }

    const { error: setErr } = await supabase.auth.updateUser({ password: next })
    if (setErr) {
      console.error('[wachtwoord-instellen]', setErr.message)
      setError('Het is niet gelukt. Probeer het opnieuw.')
      setSaving(false)
      return
    }

    await clearMustChangePassword(supabase)
    // Full reload so useProfile refetches: the gate reads must_change_password
    // and would otherwise send us straight back here.
    window.location.assign('/dashboard')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10" style={{ backgroundColor: '#F8F7F4' }}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <MeemMark className="h-10 w-10" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Kies je eigen wachtwoord</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
            Je kreeg een wachtwoord van de school. Dat staat op een blad, dus anderen
            kunnen het lezen. Kies nu een eigen wachtwoord dat alleen jij kent.
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="huidig">Het wachtwoord dat je kreeg</label>
            <input id="huidig" type={show ? 'text' : 'password'} className="input"
              value={current} onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password" required />
          </div>

          <div>
            <label className="label" htmlFor="nieuw">Je nieuwe wachtwoord</label>
            <div className="relative">
              <input id="nieuw" type={show ? 'text' : 'password'} className="input pr-10"
                value={next} onChange={e => setNext(e.target.value)}
                autoComplete="new-password" required />
              <button type="button" onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={show ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Minstens 8 tekens, met een hoofdletter, een kleine letter en een cijfer.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="herhaal">Typ je nieuwe wachtwoord nog eens</label>
            <input id="herhaal" type={show ? 'text' : 'password'} className="input"
              value={repeat} onChange={e => setRepeat(e.target.value)}
              autoComplete="new-password" required />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
            {saving
              ? <><Loader2 size={15} className="animate-spin" /> Bezig…</>
              : <><KeyRound size={15} /> Wachtwoord opslaan</>}
          </button>

          <p className="text-center text-xs text-gray-500">
            Vergeet het niet. Ben je het toch kwijt, vraag dan je leerkracht om een nieuw wachtwoord.
          </p>
        </form>
      </div>
    </div>
  )
}
