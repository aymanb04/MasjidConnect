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
// Ook "voor wie" en "gepubliceerd" zijn hier aan te passen. Zonder dat bleef een
// taak die als concept was aangemaakt voor altijd onzichtbaar voor de klas, en
// kon een leerkracht geen leerling toevoegen aan of weghalen uit een taak per
// leerling.
//
// De bevestiging noemt de aantallen. "Weet je het zeker?" wordt weggeklikt; "12
// ingediende taken, 4 bestanden en 9 punten worden mee verwijderd" niet.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { Pencil, Trash2, Loader2, X, AlertTriangle } from 'lucide-react'

interface Props {
  assignment: any
  /** Alle indieningen van deze taak, met hun bestanden en feedback. */
  submissions: any[]
  /** De rijen in assignment_students. Leeg = de hele klas (migratie 31). */
  perStudentRows: { student_id: string; task_text: string | null }[]
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

export default function AssignmentAdminBar({ assignment, submissions, perStudentRows, onSaved }: Props) {
  const router = useRouter()
  const [mode, setMode]       = useState<'idle' | 'edit' | 'confirm'>('idle')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    title:       assignment.title ?? '',
    description: assignment.description ?? '',
    due_date:    toLocalInput(assignment.due_date),
    max_score:   assignment.max_score != null ? String(assignment.max_score) : '',
    // Beide vlaggen uit = op papier of mondeling. Bestaand huiswerk staat op
    // de oude default (allebei aan); hier zet de leerkracht dat recht.
    in_app:      !!(assignment.allow_file_submission || assignment.allow_text_submission),
    is_published: !!assignment.is_published,
  })
  // Voor wie. Wordt bij het openen van het formulier gevuld vanuit de klaslijst.
  const wasPerStudent = perStudentRows.length > 0
  const [perStudent, setPerStudent] = useState(wasPerStudent)
  const [classStudents, setClassStudents] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (mode !== 'edit') return
    setPerStudent(wasPerStudent)
    setPicked(new Set(perStudentRows.map(r => r.student_id)))
    setForm(p => ({ ...p, is_published: !!assignment.is_published }))
    async function loadClass() {
      const { data } = await supabase
        .from('class_students')
        .select('profiles!class_students_student_id_fkey(id, first_name, last_name)')
        .eq('class_id', assignment.class_id)
      const coll = new Intl.Collator('nl', { sensitivity: 'base' })
      setClassStudents((data ?? []).map((d: any) => d.profiles).filter(Boolean)
        .sort((x: any, y: any) => coll.compare(x.last_name, y.last_name) || coll.compare(x.first_name, y.first_name)))
    }
    loadClass()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const submissionCount = submissions.length
  const fileCount  = submissions.reduce((n, s) => n + (s.submission_files?.length ?? 0), 0)
  const gradeCount = submissions.filter(s => s.submission_feedback?.[0]?.score != null).length
  const wasInApp = !!(assignment.allow_file_submission || assignment.allow_text_submission)
  const scoreChanged = String(assignment.max_score ?? '') !== form.max_score

  // Wat verandert er aan "voor wie"? Hieruit volgen de waarschuwingen en de
  // schrijfacties bij het opslaan.
  const currentIds = new Set(perStudentRows.map(r => r.student_id))
  const nameOf = (id: string) => {
    const st = classStudents.find(c => c.id === id)
    if (st) return `${st.first_name} ${st.last_name}`
    const sub = submissions.find(x => x.student_id === id)
    return sub?.profiles ? `${sub.profiles.first_name} ${sub.profiles.last_name}` : 'een leerling'
  }
  // Uitgevinkte rijen. Bij "hele klas" verliest niemand de taak.
  const removed = perStudent ? Array.from(currentIds).filter(id => !picked.has(id)) : []
  // Wie de taak niet meer zal zien terwijl er al werk of een punt op staat. Dat
  // blijft bewaard, maar de leerkracht moet het weten voor hij opslaat.
  // Alleen wie de taak nu nog ziet: wie al eerder werd uitgevinkt, telt niet.
  const lostWork = perStudent
    ? submissions.map(s => s.student_id)
        .filter(id => !picked.has(id) && (!wasPerStudent || currentIds.has(id)))
    : []
  const tasksLost = perStudentRows.filter(r => r.task_text && (!perStudent || !picked.has(r.student_id))).length

  // Zet assignment_students gelijk aan het formulier.
  //
  // Eerst toevoegen, dan pas weghalen: nul rijen betekent "de hele klas" (migratie
  // 31). Eerst alles wissen en dan de nieuwe selectie schrijven zou de taak even
  // aan iedereen tonen -- en bij een fout halverwege voorgoed.
  async function saveTargeting(): Promise<string | null> {
    if (!perStudent) {
      if (!wasPerStudent) return null
      const { data, error: err } = await supabase
        .from('assignment_students').delete()
        .eq('assignment_id', assignment.id).select('id')
      // Een RLS-weigering geeft geen fout maar nul rijen terug.
      if (err || (data?.length ?? 0) < perStudentRows.length) {
        console.error(err)
        return 'Terugzetten naar de hele klas is niet gelukt.'
      }
      return null
    }
    const toAdd = Array.from(picked).filter(id => !currentIds.has(id))
    if (toAdd.length) {
      const { error: err } = await supabase.from('assignment_students').upsert(
        toAdd.map(id => ({ assignment_id: assignment.id, student_id: id, task_text: null })),
        { onConflict: 'assignment_id,student_id', ignoreDuplicates: true })
      if (err) {
        console.error(err)
        return 'De leerlingen konden niet worden toegevoegd. Er is niets gewijzigd.'
      }
    }
    if (removed.length) {
      const { data, error: err } = await supabase
        .from('assignment_students').delete()
        .eq('assignment_id', assignment.id).in('student_id', removed).select('id')
      if (err || (data?.length ?? 0) < removed.length) {
        console.error(err)
        return 'Niet alle uitgevinkte leerlingen konden worden weggehaald. Zij zien de taak mogelijk nog.'
      }
    }
    return null
  }

  async function save() {
    if (!form.title.trim()) { setError('Een titel is verplicht.'); return }
    if (perStudent && picked.size === 0) {
      setError('Vink minstens één leerling aan, of kies "Hele klas".')
      return
    }
    setBusy(true); setError('')
    // Eerst wie, dan pas publiceren: een concept dat tegelijk ingeperkt en
    // gepubliceerd wordt, mag niet even aan de hele klas verschijnen.
    const targetErr = await saveTargeting()
    if (targetErr) {
      setError(targetErr)
      setBusy(false)
      // Een deel kan al geschreven zijn; toon wat er nu werkelijk staat.
      onSaved()
      return
    }
    const { data, error: err } = await supabase
      .from('assignments')
      .update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        // Een leeg veld betekent "geen deadline", niet "vandaag".
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        max_score: form.max_score ? parseInt(form.max_score) : null,
        // Alleen bij een omschakeling aanraken: een titel bewerken mag een taak
        // met enkel "Bestand" niet stilzwijgend ook "Tekst" geven. Terug naar
        // "ja" zet beide types aan.
        ...(form.in_app !== wasInApp
          ? { allow_file_submission: form.in_app, allow_text_submission: form.in_app }
          : {}),
        is_published: form.is_published,
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
        <div>
          <span className="block text-xs text-gray-500 mb-1">Inleveren via de app?</span>
          <div className="flex gap-2">
            {[{ v: false, l: 'Nee, op papier of mondeling' }, { v: true, l: 'Ja, leerlingen uploaden' }].map(o => (
              <button key={String(o.v)} type="button" onClick={() => setForm(p => ({ ...p, in_app: o.v }))}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs transition-colors ${form.in_app === o.v
                  ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                  : 'border-border text-gray-600 hover:bg-gray-50'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="block text-xs text-gray-500 mb-1">Voor wie</span>
          <div className="flex gap-2">
            {[{ v: false, l: 'Hele klas' }, { v: true, l: 'Per leerling' }].map(o => (
              <button key={String(o.v)} type="button"
                onClick={() => {
                  setPerStudent(o.v)
                  // Van hele klas naar per leerling: begin met iedereen aangevinkt,
                  // zodat er niemand stilzwijgend uitvalt.
                  if (o.v && !wasPerStudent && picked.size === 0) setPicked(new Set(classStudents.map(c => c.id)))
                }}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs transition-colors ${perStudent === o.v
                  ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                  : 'border-border text-gray-600 hover:bg-gray-50'}`}>
                {o.l}
              </button>
            ))}
          </div>
          {perStudent && (
            <>
              <div className="flex items-center justify-between gap-3 mt-2 mb-1">
                <span className="text-xs text-gray-500">
                  {picked.size} van {classStudents.length} aangevinkt. Wie niet aangevinkt is, ziet dit huiswerk niet.
                </span>
                <span className="flex gap-2 text-xs shrink-0">
                  <button type="button" className="text-primary-700 hover:underline"
                    onClick={() => setPicked(new Set(classStudents.map(c => c.id)))}>Alles</button>
                  <button type="button" className="text-gray-500 hover:underline"
                    onClick={() => setPicked(new Set())}>Niets</button>
                </span>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-white p-2">
                {classStudents.length === 0
                  ? <p className="px-1 py-2 text-sm text-gray-400">Geen leerlingen in deze klas.</p>
                  : classStudents.map(st => (
                    <label key={st.id} className="flex items-center gap-2 px-1 py-0.5 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 accent-primary-600"
                        checked={picked.has(st.id)}
                        onChange={e => {
                          const on = e.target.checked
                          setPicked(prev => {
                            const n = new Set(prev)
                            if (on) n.add(st.id); else n.delete(st.id)
                            return n
                          })
                        }} />
                      {st.first_name} {st.last_name}
                    </label>
                  ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Een eigen opdracht per leerling vul je in de leerlingenlijst hieronder in.
              </p>
            </>
          )}
          {lostWork.length > 0 && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {lostWork.map(nameOf).join(', ')} {lostWork.length === 1 ? 'heeft' : 'hebben'} al werk of punten op
              deze taak. Dat blijft bewaard, maar {lostWork.length === 1 ? 'deze leerling ziet' : 'zij zien'} de taak niet meer.
            </p>
          )}
          {tasksLost > 0 && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {tasksLost} {tasksLost === 1 ? 'eigen opdracht wordt' : 'eigen opdrachten worden'} gewist
              {perStudent ? ' (van de uitgevinkte leerlingen).' : '. Iedereen krijgt weer dezelfde taak.'}
            </p>
          )}
        </div>
        <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" checked={form.is_published}
            onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} />
          <div>
            <div className="text-sm font-medium text-gray-800">Gepubliceerd</div>
            <div className="text-xs text-gray-500">
              {form.is_published
                ? 'Leerlingen zien dit huiswerk.'
                : 'Concept: alleen leerkrachten en beheer zien dit huiswerk.'}
            </div>
          </div>
        </label>
        {assignment.is_published && !form.is_published && submissionCount > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Er is al werk ingediend. Als concept zien de leerlingen deze taak en hun punten erop niet meer.
          </p>
        )}
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
