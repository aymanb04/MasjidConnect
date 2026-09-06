'use client'

import { useState } from 'react'
import { KeyRound, Loader2, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/singleton'

// Pupils are onboarded with school-issued logins on a domain that receives no
// mail, so "wachtwoord vergeten" cannot reach them. This is how a school
// administrator gets a pupil back in without going through the operator.
//
// The new password is shown ONCE, in the browser, and never stored anywhere we
// can read it back. If the admin closes the panel without writing it down, the
// only way forward is to generate another one — which is the correct trade-off:
// a password we could re-display is a password we are keeping.

export function ResetPasswordButton({
  userId, name, onDone,
}: { userId: string; name: string; onDone?: () => void }) {
  const [state, setState]   = useState<'idle' | 'confirm' | 'working' | 'done'>('idle')
  const [password, setPass] = useState('')
  const [error, setError]   = useState('')
  const [copied, setCopied] = useState(false)

  async function reset() {
    setState('working')
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/user/set-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Instellen mislukt.')
      setState('confirm')
      return
    }
    setPass(data.password)
    setState('done')
    onDone?.()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the password is on screen to copy by hand.
    }
  }

  if (state === 'working') {
    return <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />
  }

  // The reveal gets its own panel rather than a slot in the user row. Inline,
  // the password chip squeezed the name column down to "O…" — an admin resetting
  // a class would be copying credentials with no idea whose they are, which is
  // exactly how the wrong password ends up on the wrong child's slip. It is also
  // the only place we can state that this is shown once.
  if (state === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
           role="dialog" aria-modal="true" aria-labelledby="pw-title">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
          <h2 id="pw-title" className="font-semibold text-gray-900">Nieuw wachtwoord</h2>
          <p className="mt-1 text-sm text-gray-500">voor {name}</p>

          <div className="mt-4 flex items-center justify-center gap-2">
            <code className="rounded-xl bg-primary-50 px-4 py-3 font-mono text-lg font-semibold tracking-wider text-primary-800">
              {password}
            </code>
            <button onClick={copy}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary-600"
              title="Kopiëren">
              {copied ? <Check size={16} className="text-primary-600" /> : <Copy size={16} />}
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            Schrijf dit nu over. Zodra je dit venster sluit, is het wachtwoord niet
            meer op te vragen — er kan dan enkel een nieuw ingesteld worden.
          </p>

          <button onClick={() => { setState('idle'); setPass('') }}
            className="btn-primary mt-5 w-full justify-center">
            Klaar
          </button>
        </div>
      </div>
    )
  }

  // The confirm label is kept deliberately short: the user row already holds a
  // name, an e-mail, a role badge and three action buttons. A full sentence here
  // pushed the Ja/Nee buttons outside the card — invisible, and unclickable on a
  // phone. The explanation lives in the title attribute instead.
  if (state === 'confirm') {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0" title={`Nieuw wachtwoord voor ${name}. Het oude werkt daarna niet meer.`}>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {error || 'Nieuw wachtwoord?'}
        </span>
        <button onClick={reset}
          className="rounded-lg bg-primary-600 px-2 py-1 text-xs text-white transition-colors hover:bg-primary-700">
          Ja
        </button>
        <button onClick={() => { setState('idle'); setError('') }}
          className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-200">
          Nee
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setState('confirm')}
      className="opacity-60 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-all flex-shrink-0"
      title="Nieuw wachtwoord instellen">
      <KeyRound size={13} />
    </button>
  )
}
