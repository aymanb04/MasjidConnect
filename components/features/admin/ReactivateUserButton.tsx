'use client'

import { useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'

export function ReactivateUserButton({ userId, name, onReactivated }: { userId: string; name: string; onReactivated: () => void }) {
  const [loading, setLoading]   = useState(false)
  const [confirm, setConfirm]   = useState(false)

  async function reactivate() {
    setLoading(true)
    const res = await fetch('/api/user/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      onReactivated()
    } else {
      const data = await res.json()
      alert('Fout: ' + data.error)
      setLoading(false)
      setConfirm(false)
    }
  }

  if (loading) return <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-gray-500">{name} reactiveren?</span>
        <button onClick={reactivate}
          className="text-xs bg-primary-600 text-white px-2 py-1 rounded-lg hover:bg-primary-700 transition-colors">
          Ja
        </button>
        <button onClick={() => setConfirm(false)}
          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 transition-colors">
          Nee
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirm(true)}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-primary-600 p-1 flex-shrink-0"
      title="Reactiveren">
      <RotateCcw size={14} />
    </button>
  )
}
