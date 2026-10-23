'use client'

import { useState } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/singleton'

type Mode = 'idle' | 'confirm-archive' | 'confirm-gdpr' | 'loading-archive' | 'loading-gdpr'

export function DeleteUserButton({ userId, name, onDeleted }: { userId: string; name: string; onDeleted: () => void }) {
  const [mode, setMode] = useState<Mode>('idle')

  async function archive() {
    setMode('loading-archive')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/user/archive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      onDeleted()
    } else {
      const data = await res.json()
      alert('Fout: ' + data.error)
      setMode('idle')
    }
  }

  async function anonymize() {
    setMode('loading-gdpr')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/user/anonymize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      onDeleted()
    } else {
      const data = await res.json()
      alert('Fout: ' + data.error)
      setMode('idle')
    }
  }

  if (mode === 'loading-archive' || mode === 'loading-gdpr') {
    return <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />
  }

  // The confirmations open as a small box ABOVE the icon instead of inline:
  // inline, next to the row's other icons, the question pushed the buttons out
  // of the card and squeezed the name away. Above, because the superadmin
  // card clips with overflow-hidden and there is always a header above a row.
  const confirmBox = (children: React.ReactNode) => (
    <div className="relative flex-shrink-0">
      <Archive size={14} className="m-1 text-gray-400" />
      <div className="absolute right-0 bottom-full mb-1 z-20 w-60 rounded-xl border border-border bg-white shadow-lg p-3">
        {children}
      </div>
    </div>
  )

  if (mode === 'confirm-gdpr') {
    return confirmBox(
      <>
        <p className="text-xs text-red-600 font-medium leading-snug">Persoonsgegevens van {name} definitief wissen?</p>
        <p className="text-xs text-gray-500 leading-snug mt-1">Cijfers en aanwezigheid blijven anoniem bewaard. Dit kan niet ongedaan worden.</p>
        <div className="flex justify-end gap-1.5 mt-2.5">
          <button onClick={() => setMode('idle')}
            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors">
            Nee
          </button>
          <button onClick={anonymize}
            className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition-colors">
            Ja, wissen
          </button>
        </div>
      </>
    )
  }

  if (mode === 'confirm-archive') {
    return confirmBox(
      <>
        <p className="text-xs text-gray-700 font-medium leading-snug">{name} archiveren?</p>
        <div className="flex items-center justify-end gap-1.5 mt-2.5">
          <button onClick={() => setMode('confirm-gdpr')}
            className="text-xs text-red-500 hover:text-red-600 px-1 py-1 mr-auto transition-colors underline underline-offset-2">
            GDPR
          </button>
          <button onClick={() => setMode('idle')}
            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors">
            Nee
          </button>
          <button onClick={archive}
            className="text-xs bg-gray-700 text-white px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">
            Ja
          </button>
        </div>
      </>
    )
  }

  return (
    <button onClick={() => setMode('confirm-archive')}
      className="opacity-60 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 p-1 flex-shrink-0"
      title="Archiveren">
      <Archive size={14} />
    </button>
  )
}
