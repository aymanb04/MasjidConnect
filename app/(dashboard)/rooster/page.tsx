'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, EmptyState } from '@/components/ui/PageShell'
import { Clock, Plus, X, Loader2 } from 'lucide-react'

const DAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

function fmt(t: string) { return t.slice(0, 5) }

export default function RoosterPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [sessions, setSessions]   = useState<any[]>([])
  const [classes, setClasses]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!profile) return
    loadData()
  }, [profile])

  async function loadData() {
    const supabase = getSupabase()
    let data: any[] = []

    if (profile!.role === 'student') {
      const { data: enr } = await supabase.from('class_students').select('class_id').eq('student_id', profile!.id)
      const ids = enr?.map((e: any) => e.class_id) ?? []
      if (ids.length) {
        const { data: s } = await supabase.from('class_sessions').select('*, classes(name, color)').in('class_id', ids).order('day_of_week').order('start_time')
        data = s ?? []
      }
    } else if (profile!.role === 'teacher') {
      const { data: t } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile!.id)
      const ids = t?.map((x: any) => x.class_id) ?? []
      if (ids.length) {
        const { data: s } = await supabase.from('class_sessions').select('*, classes(name, color)').in('class_id', ids).order('day_of_week').order('start_time')
        data = s ?? []
      }
    } else if (profile!.role === 'admin') {
      const { data: s } = await supabase.from('class_sessions').select('*, classes(name, color)').eq('tenant_id', profile!.tenant_id).order('day_of_week').order('start_time')
      data = s ?? []
      const { data: c } = await supabase.from('classes').select('id, name, color').eq('tenant_id', profile!.tenant_id).eq('is_archived', false).order('name')
      setClasses(c ?? [])
    } else {
      const { data: s } = await supabase.from('class_sessions').select('*, classes(name, color), tenants(name)').order('day_of_week').order('start_time')
      data = s ?? []
    }

    setSessions(data)
    setLoading(false)
  }

  async function deleteSession(id: string) {
    await getSupabase().from('class_sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  if (profileLoading || loading) return <PageLoader />

  const byDay: Record<number, any[]> = {}
  sessions.forEach(s => {
    if (!byDay[s.day_of_week]) byDay[s.day_of_week] = []
    byDay[s.day_of_week].push(s)
  })
  const activeDays = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  return (
    <div className="animate-slide-up">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Rooster</h1>
          <p className="page-subtitle">Wekelijks lesrooster</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16}/> Les toevoegen
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Clock size={40}/>}
          title="Geen lessen ingepland"
          subtitle={isAdmin ? 'Voeg lessen toe via de knop hierboven.' : 'Er zijn nog geen lessen ingepland.'}
        />
      ) : (
        <div className="space-y-4">
          {activeDays.map(day => (
            <div key={day} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-gray-50/60">
                <h2 className="font-semibold text-gray-800 text-sm">{DAYS[day]}</h2>
              </div>
              <div className="divide-y divide-border">
                {byDay[day].map((s: any) => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 group">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.classes?.color ?? '#1B6B4A' }}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800">{s.classes?.name}</div>
                      {s.location && <div className="text-xs text-gray-400 mt-0.5">{s.location}</div>}
                    </div>
                    <div className="text-sm text-gray-600 flex-shrink-0 tabular-nums font-medium">
                      {fmt(s.start_time)} – {fmt(s.end_time)}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteSession(s.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
                        title="Verwijderen"
                      >
                        <X size={14}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddSessionModal
          classes={classes}
          tenantId={profile!.tenant_id!}
          onClose={() => setShowModal(false)}
          onAdded={() => { setShowModal(false); loadData() }}
        />
      )}
    </div>
  )
}

function AddSessionModal({ classes, tenantId, onClose, onAdded }: {
  classes: any[]; tenantId: string; onClose: () => void; onAdded: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    class_id: '', day_of_week: '5', start_time: '09:00', end_time: '11:00', location: '',
  })

  async function handleAdd() {
    if (!form.class_id) return
    setLoading(true)
    setError('')
    const { error: err } = await getSupabase().from('class_sessions').insert({
      class_id:    form.class_id,
      tenant_id:   tenantId,
      day_of_week: parseInt(form.day_of_week),
      start_time:  form.start_time,
      end_time:    form.end_time,
      location:    form.location.trim() || null,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-gray-900">Les toevoegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label">Klas *</label>
            <select value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))} className="input">
              <option value="">Kies een klas…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Dag *</label>
            <select value={form.day_of_week} onChange={e => setForm(p => ({ ...p, day_of_week: e.target.value }))} className="input">
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Beginuur *</label>
              <input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} className="input"/>
            </div>
            <div>
              <label className="label">Einduur *</label>
              <input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} className="input"/>
            </div>
          </div>
          <div>
            <label className="label">Locatie <span className="text-gray-400">(optioneel)</span></label>
            <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Bijv. Zaal 1" className="input"/>
          </div>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={handleAdd} disabled={loading || !form.class_id} className="btn-primary flex-1 justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin"/> Toevoegen…</> : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
