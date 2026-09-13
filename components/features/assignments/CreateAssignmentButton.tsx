'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, X, Loader2, FileText } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/useScrollLock'

export default function CreateAssignmentButton({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useProfile()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  useScrollLock(open)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [classes, setClasses] = useState<any[]>([])
  // Per-pupil homework (migration 31). Default stays "hele klas", so nothing
  // about the existing flow changes unless a teacher opts in.
  const [perStudent, setPerStudent] = useState(false)
  const [students, setStudents]     = useState<any[]>([])
  const [picked, setPicked]         = useState<Record<string, { on: boolean; task: string }>>({})
  const [form, setForm]       = useState({
    class_id: searchParams?.get('klas') ?? '',
    title: '', description: '', due_date: '', max_score: '',
    allow_text: true, allow_file: true, is_published: true,
  })

  useEffect(() => {
    if (!open || !profile) return
    async function load() {
      if (profile!.role === 'admin') {
        const { data } = await supabase.from('classes').select('id, name').eq('tenant_id', profile!.tenant_id).eq('is_archived', false)
        setClasses(data ?? [])
      } else {
        const { data } = await supabase.from('class_teachers').select('classes(id, name)').eq('teacher_id', profile!.id)
        setClasses(data?.map((d: any) => d.classes).filter(Boolean) ?? [])
      }
    }
    load()
  }, [open, profile])

  // Load the class list when per-pupil mode is on and a class is chosen.
  useEffect(() => {
    if (!perStudent || !form.class_id) { setStudents([]); return }
    async function loadStudents() {
      const { data } = await supabase
        .from('class_students')
        .select('profiles!class_students_student_id_fkey(id, first_name, last_name)')
        .eq('class_id', form.class_id)
      const list = (data ?? []).map((d: any) => d.profiles).filter(Boolean)
        .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name))
      setStudents(list)
      setPicked(Object.fromEntries(list.map((s: any) => [s.id, { on: true, task: '' }])))
    }
    loadStudents()
  }, [perStudent, form.class_id])

  async function handleCreate() {
    if (!form.class_id || !form.title.trim()) return
    setLoading(true)
    try {
      const { data: created, error } = await supabase.from('assignments').insert({
        class_id: form.class_id, created_by: profile!.id,
        title: form.title.trim(), description: form.description || null,
        due_date: form.due_date || null,
        max_score: form.max_score ? parseInt(form.max_score) : null,
        allow_text_submission: form.allow_text,
        allow_file_submission: form.allow_file,
        is_published: form.is_published,
      }).select('id').single()
      // supabase-js never throws: without this the modal closed on failure and
      // the teacher believed the assignment existed.
      if (error || !created) {
        console.error(error)
        setError('Het huiswerk kon niet worden aangemaakt. Probeer het opnieuw.')
        return
      }

      // Per-pupil rows. Their presence is what limits the assignment to these
      // pupils; no rows means the whole class, which is the default.
      if (perStudent) {
        const rows = students.filter(s => picked[s.id]?.on).map(s => ({
          assignment_id: created.id,
          student_id: s.id,
          task_text: picked[s.id]?.task.trim() || null,
        }))
        if (rows.length === 0) {
          setError('Kies minstens één leerling, of zet het huiswerk op "hele klas".')
          await supabase.from('assignments').delete().eq('id', created.id)
          return
        }
        const { error: rowErr } = await supabase.from('assignment_students').insert(rows)
        if (rowErr) {
          console.error(rowErr)
          // Leaving the assignment behind would publish it to the WHOLE class —
          // the opposite of what the teacher asked for. Remove it.
          await supabase.from('assignments').delete().eq('id', created.id)
          setError('De opdrachten per leerling konden niet worden opgeslagen. Er is niets aangemaakt.')
          return
        }
      }
      setOpen(false)
      setError('')
      setForm({ class_id: '', title: '', description: '', due_date: '', max_score: '', allow_text: true, allow_file: true, is_published: true })
      setPerStudent(false); setStudents([]); setPicked({})
      // router.refresh() only re-runs server components; the huiswerk list
      // fetches client-side in a useEffect, so it would not pick this up.
      onCreated?.()
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16}/> Nieuw huiswerk</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-modal animate-slide-up">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center"><FileText size={16} className="text-primary-600"/></div>
                <h2 className="font-semibold text-gray-900">Nieuw huiswerk</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div><label className="label">Klas *</label>
                <select value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))} className="input">
                  <option value="">Kies een klas…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Titel *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Bijv. Herhaling soera Al-Fatiha" className="input"/>
              </div>
              <div><label className="label">Beschrijving <span className="text-gray-400">(optioneel)</span></label>
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Extra instructies…" className="input resize-none"/>
              </div>
              {/* Per-pupil homework. The Qur'an case: every child memorises a
                  different range, so the class shares a title but not a task. */}
              <div>
                <label className="label">Voor wie</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPerStudent(false)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${!perStudent
                      ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                      : 'border-border text-gray-600 hover:bg-gray-50'}`}>
                    Hele klas
                  </button>
                  <button type="button" onClick={() => setPerStudent(true)} disabled={!form.class_id}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${perStudent
                      ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                      : 'border-border text-gray-600 hover:bg-gray-50'}`}>
                    Per leerling
                  </button>
                </div>
                {perStudent && (
                  <>
                    <p className="mt-2 text-xs text-gray-500">
                      Vink aan wie dit huiswerk krijgt. Je kan per leerling een eigen
                      opdracht invullen, bijvoorbeeld “soera 78, vers 1-20”. Wie niet
                      aangevinkt is, ziet dit huiswerk niet.
                    </p>
                    <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                      {students.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-gray-400">Geen leerlingen in deze klas.</p>
                      ) : students.map(st => (
                        <div key={st.id} className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4 flex-shrink-0 accent-primary-600"
                            checked={picked[st.id]?.on ?? false}
                            onChange={e => setPicked(p => ({ ...p, [st.id]: { ...(p[st.id] ?? { task: '' }), on: e.target.checked } }))} />
                          <span className="w-32 flex-shrink-0 truncate text-sm text-gray-700">
                            {st.first_name} {st.last_name}
                          </span>
                          <input type="text" className="input flex-1 py-1 text-xs"
                            placeholder="Opdracht voor deze leerling…"
                            disabled={!(picked[st.id]?.on ?? false)}
                            value={picked[st.id]?.task ?? ''}
                            onChange={e => setPicked(p => ({ ...p, [st.id]: { ...(p[st.id] ?? { on: true }), task: e.target.value } }))} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Deadline</label><input type="datetime-local" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="input"/></div>
                <div><label className="label">Max punten</label><input type="number" min={0} value={form.max_score} onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} placeholder="Leeg = geen score" className="input"/></div>
              </div>
              <div><label className="label">Indieningstypes</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.allow_file} onChange={e => setForm(p => ({ ...p, allow_file: e.target.checked }))}/> Bestand</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.allow_text} onChange={e => setForm(p => ({ ...p, allow_text: e.target.checked }))}/> Tekst</label>
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.is_published} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))}/>
                <div><div className="text-sm font-medium text-gray-800">Onmiddellijk publiceren</div><div className="text-xs text-gray-500">Leerlingen zien dit meteen</div></div>
              </label>
            </div>
            {error && (
              <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="flex flex-shrink-0 gap-3 border-t border-border p-6">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Annuleren</button>
              <button onClick={handleCreate} disabled={loading || !form.class_id || !form.title.trim()} className="btn-primary flex-1 justify-center">
                {loading ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</> : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
