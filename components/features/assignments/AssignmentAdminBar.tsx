'use client'

// Bewerken en verwijderen van een bestaande taak.
//
// Tot nu kon geen van beide: een taak was, eenmaal aangemaakt, definitief. Een
// typfout in de titel of een verkeerde deadline bleef staan, en de enige uitweg
// was een tweede taak ernaast.
//
// Bewerken gaat gewoon door RLS heen (`teacher_manage_assignments` staat FOR
// ALL). Verwijderen loopt via /api/assignment/delete, omdat de FK-cascade de
// geuploade bestanden in de bucket niet aanraakt.
//
// De bevestiging noemt de aantallen. "Weet je het zeker?" wordt weggeklikt; "12
// ingediende taken, 4 bestanden en 9 punten worden mee verwijderd" niet.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { Pencil, Trash2, Loader2, X, AlertTriangle } from 'lucide-react'

interface Props {
  assignment: any
  /** Alle indieningen van deze taak, met hun bestanden en feedback. */
  submissions: any[]
  onSaved: () => void
}

// <input type="datetime-local"> wil "YYYY-MM-DDTHH:mm" in LOKALE tijd. De
// waarde uit de database is UTC met een zone erachter; die er rechtstreeks in
// duwen schuift de deadline met het tijdsverschil.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AssignmentAdminBar({ assignment, submissions, onSaved }: Props) {
  const router = useRouter()
  const [mode, setMode]       = useState<'idle' | 'edit' | 'confirm'>('idle')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    title:       assignment.title ?? '',
    description: assignment.description ?? '',
    due_date:    toLocalInput(assignment.due_date),
    max_score:   assignment.max_score != null ? String(assignment.max_score) : '',
  })

  const submissionCount = submissions.length
  const fileCount  = submissions.reduce((n, s) => n + (s.submission_files?.length ?? 0), 0)
  const gradeCount = submissions.filter(s => s.submission_feedback?.[0]?.score != null).length
  const scoreChanged = String(assignment.max_score ?? '') !== form.max_score

  async function save() {
    if (!form.title.trim()) { setError('Een titel is verplicht.'); return }
    setBusy(true); setError('')
    const { data, error: err } = await supabase
      .from('assignments')
      .update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        // Een leeg veld betekent "geen deadline", niet "vandaag".
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        max_score: form.max_score ? parseInt(form.max_score) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
      .select('id')
    // Een RLS-weigering geeft geen fout maar nul rijen terug.
    if (err || !data?.length) {
      console.error(err)
      setError('Opslaan mislukt. Mogelijk heb je geen rechten op deze taak.')
      setBusy(false)
      return
    }
    setBusy(false); setMode('idle')
    onSaved()
  }

  async function remove() {
    setBusy(true); setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Je sessie is verlopen. Meld je opnieuw aan.'); setBusy(false); return }

    const res = await fetch('/api/assignment/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ assignmentId: assignment.id }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? 'Verwijderen mislukt.')
      setBusy(false)
      return
    }
    router.push('/huiswerk')
  }

  if (mode === 'idle') {
    return (
      <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
        <button onClick={() => setMode('edit')}
          className="text-xs text-gray-500 hover:text-primary-700 flex items-center gap-1.5 transition-colors">
          <Pencil size={13} /> Bewerken
        </button>
        <button onClick={() => { setMode('confirm'); setError('') }}
          className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1.5 ml-auto transition-colors">
          <Trash2 size={13} /> Verwijderen
        </button>
      </div>
    )
  }

  if (mode === 'confirm') {
    const heeftWerk = submissionCount > 0
    return (
      <div className="mt-5 pt-4 border-t border-border">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                &ldquo;{assignment.title}&rdquo; definitief verwijderen?
              </p>
              {heeftWerk ? (
                <p className="text-sm text-red-800 mt-1.5 leading-relaxed">
                  Deze taak heeft <strong>{submissionCount} {submissionCount === 1 ? 'indiening' : 'indieningen'}</strong>
                  {fileCount > 0 && <>, <strong>{fileCount} {fileCount === 1 ? 'geüpload bestand' : 'geüploade bestanden'}</strong></>}
                  {gradeCount > 0 && <> en <strong>{gradeCount} {gradeCount === 1 ? 'ingevoerd punt' : 'ingevoerde punten'}</strong></>}.
                  Dat wordt allemaal mee verwijderd, ook het werk van de leerlingen. Dit kan niet ongedaan gemaakt worden.
                </p>
              ) : (
                <p className="text-sm text-red-800 mt-1.5">
                  Er is nog niets ingediend. Er gaat dus geen werk van leerlingen verloren.
                </p>
              )}
              {gradeCount > 0 && (
                <p className="text-xs text-red-700 mt-2">
                  De gemiddelden en het rapport worden hierna zonder deze punten berekend.
                </p>
              )}
              {error && <p className="text-sm text-red-700 mt-2 font-medium">{error}</p>}
              <div className="flex items-center gap-2 mt-3.5">
                <button onClick={remove} disabled={busy}
                  className="text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Ja, definitief verwijderen
                </button>
                <button onClick={() => setMode('idle')} disabled={busy}
                  className="text-xs text-gray-600 hover:text-gray-800 px-2 py-2">
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Huiswerk bewerken</h3>
        <button onClick={() => setMode('idle')} className="text-gray-300 hover:text-gray-500">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor="hw-titel" className="block text-xs text-gray-500 mb-1">Titel</label>
          <input id="hw-titel" className="input w-full" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="hw-oms" className="block text-xs text-gray-500 mb-1">Omschrijving</label>
          <textarea id="hw-oms" rows={3} className="input w-full resize-none" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="hw-deadline" className="block text-xs text-gray-500 mb-1">Deadline</label>
            <input id="hw-deadline" type="datetime-local" className="input w-full" value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="hw-max" className="block text-xs text-gray-500 mb-1">Max. punten</label>
            <input id="hw-max" type="number" min={1} className="input w-full" value={form.max_score}
              onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} />
          </div>
        </div>
        {scoreChanged && gradeCount > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Er zijn al {gradeCount} {gradeCount === 1 ? 'punt' : 'punten'} ingevoerd op deze taak. Als je het maximum
            aanpast, blijven die cijfers staan maar tellen ze anders mee in het gemiddelde.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy || !form.title.trim()}
            className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5">
            {busy ? <Loader2 size={13} className="animate-spin" /> : null} Opslaan
          </button>
          <button onClick={() => setMode('idle')} disabled={busy}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-2">Annuleren</button>
        </div>
      </div>
    </div>
  )
}
