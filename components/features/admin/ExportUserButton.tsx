'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/singleton'

// Art. 15/20 in one click: a parent asks what the school holds about their
// child, and the admin hands them a file instead of the operator querying the
// database by hand under a one-month deadline.
//
// Downloads as JSON because Art. 20 asks for a "structured, commonly used and
// machine-readable" format. It is not pretty to read — that is the point; it is
// the portable copy. The school can open it in any spreadsheet or text editor,
// and a receiving platform can import it.

export function ExportUserButton({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ scope: 'user', userId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert('Export mislukt: ' + (body.error ?? 'onbekende fout'))
        return
      }
      const safe = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gegevens-${safe}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  if (busy) return <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />

  return (
    <button onClick={run}
      className="opacity-60 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-primary-600 hover:bg-primary-50 transition-all flex-shrink-0"
      title="Gegevens exporteren (inzage / overdraagbaarheid)">
      <Download size={13} />
    </button>
  )
}
