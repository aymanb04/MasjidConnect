'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, X, Loader2, FileText } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/useScrollLock'

export default function CreateAssignmentButton() {
  const { profile } = useProfile()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  useScrollLock(open)
  const [loading, setLoading] = useState(false)
  const [classes, setClasses] = useState<any[]>([])
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

  async function handleCreate() {
    if (!form.class_id || !form.title.trim()) return
    setLoading(true)
    try {
      await supabase.from('assignments').insert({
        class_id: form.class_id, created_by: profile!.id,
        title: form.title.trim(), description: form.description || null,
        due_date: form.due_date || null,
        max_score: form.max_score ? parseInt(form.max_score) : null,
        allow_text_submission: form.allow_text,
        allow_file_submission: form.allow_file,
        is_published: form.is_published,
      })
      setOpen(false)
      setForm({ class_id: '', title: '', description: '', due_date: '', max_score: '', allow_text: true, allow_file: true, is_published: true })
      router.refresh()
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16}/> Nieuw huiswerk</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center"><FileText size={16} className="text-primary-600"/></div>
                <h2 className="font-semibold text-gray-900">Nieuw huiswerk</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
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
            <div className="flex gap-3 p-6 border-t border-border">
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
