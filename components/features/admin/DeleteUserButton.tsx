'use client'

import { useState } from 'react'
import { Archive, Loader2 } from 'lucide-react'

type Mode = 'idle' | 'confirm-archive' | 'confirm-gdpr' | 'loading-archive' | 'loading-gdpr'

export function DeleteUserButton({ userId, name, onDeleted }: { userId: string; name: string; onDeleted: () => void }) {
  const [mode, setMode] = useState<Mode>('idle')

  async function archive() {
    setMode('loading-archive')
    const res = await fetch('/api/user/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch('/api/user/anonymize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (mode === 'confirm-gdpr') {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-red-600 font-medium">PII wissen, data anoniem bewaren?</span>
        <button onClick={anonymize}
          className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition-colors">
          Ja, wissen
        </button>
        <button onClick={() => setMode('idle')}
          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors">
          Nee
        </button>
      </div>
    )
  }

  if (mode === 'confirm-archive') {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-gray-500">{name} archiveren?</span>
        <button onClick={archive}
          className="text-xs bg-gray-700 text-white px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">
          Ja
        </button>
        <button onClick={() => setMode('confirm-gdpr')}
          className="text-xs text-red-500 hover:text-red-600 px-1 py-1 transition-colors underline underline-offset-2">
          GDPR
        </button>
        <button onClick={() => setMode('idle')}
          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors">
          Nee
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setMode('confirm-archive')}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 p-1 flex-shrink-0"
      title="Archiveren">
      <Archive size={14} />
    </button>
  )
}
