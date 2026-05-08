'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export function DeleteUserButton({ userId, name, onDeleted }: { userId: string; name: string; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const res = await fetch('/api/user/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      onDeleted()
    } else {
      const data = await res.json()
      alert('Fout: ' + data.error)
    }
    setLoading(false)
    setConfirm(false)
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-gray-500">{name} verwijderen?</span>
        <button onClick={handleDelete} disabled={loading}
          className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg hover:bg-red-600 transition-colors">
          {loading ? '...' : 'Ja'}
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
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-1 flex-shrink-0">
      <Trash2 size={14} />
    </button>
  )
}
