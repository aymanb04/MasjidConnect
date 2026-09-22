'use client'

import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { MessageSquare } from 'lucide-react'

interface Note {
  id: string
  body: string
  created_at: string
  author_name?: string | null
}

// De nota's die de school met dit gezin gedeeld heeft (migratie 39/40).
//
// Staat bewust op het startscherm van de leerling en niet achter een menu-item:
// er zijn geen ouderlogins, dus een ouder die meekijkt komt hier binnen en gaat
// niet op zoek. Wordt niets gedeeld, dan is de kaart er niet -- een lege doos
// met "geen nota's" suggereert dat er iets te halen valt.
export function StudentNotesCard({ notes }: { notes?: Note[] }) {
  if (!notes?.length) return null

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare size={16} className="text-primary-600" /> Nota&apos;s van de school
        </h2>
      </div>
      <div className="space-y-3">
        {notes.map(n => (
          <div key={n.id} className="rounded-xl border border-border p-3.5">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-medium text-gray-600">{n.author_name || 'De school'}</span>
              <span className="text-xs text-gray-300">
                {format(new Date(n.created_at), 'd MMM yyyy', { locale: nl })}
              </span>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
