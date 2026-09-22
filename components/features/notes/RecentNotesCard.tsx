'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { MessageSquare, Eye, EyeOff, ChevronRight } from 'lucide-react'

interface RecentNote {
  id: string
  body: string
  created_at: string
  student_id: string
  student_name?: string | null
  author_name?: string | null
  visible_to_student: boolean
}

// De "melding" waar de school om vroeg (mail 2026-09-21: "Is nu wel mogelijk
// dat ik en Khalid een melding krijgen van elke nota dat een leerkracht
// schrijft?"), in de app zelf: de beheerders zien op hun startscherm wat er de
// voorbije twee weken geschreven is.
//
// Bewust GEEN badge met een ongelezen-teller. Die zou per toestel in de browser
// moeten worden bijgehouden (localStorage), dus twee beheerders op drie
// toestellen krijgen drie verschillende tellers, en een gewiste browser zet
// alles op "nieuw". Een datum per regel liegt nooit.
export function RecentNotesCard({ notes, countLast7d }: { notes?: RecentNote[]; countLast7d?: number }) {
  if (!notes?.length) return null

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare size={16} className="text-primary-600" /> Recente nota&apos;s
        </h2>
        {countLast7d ? (
          <span className="text-xs text-gray-500">{countLast7d} deze week</span>
        ) : null}
      </div>
      <div className="space-y-2">
        {notes.map(n => (
          <Link
            key={n.id}
            href={`/dossiers/${n.student_id}`}
            className="block p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
          >
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-medium text-gray-800 group-hover:text-primary-700">
                {n.student_name || 'Leerling'}
              </span>
              <span className="text-xs text-gray-400">door {n.author_name || '—'}</span>
              <span className="text-xs text-gray-300">
                {format(new Date(n.created_at), 'd MMM HH:mm', { locale: nl })}
              </span>
              {n.visible_to_student ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-100 rounded-full px-2 py-0.5">
                  <Eye size={11} /> Gedeeld
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <EyeOff size={11} /> Intern
                </span>
              )}
              <ChevronRight size={14} className="ml-auto text-gray-300 shrink-0" />
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">{n.body}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
