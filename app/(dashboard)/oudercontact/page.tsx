'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { CalendarClock, Plus, X, Loader2, Check, Trash2, Users } from 'lucide-react'

interface Slot {
  id: string
  teacher_id: string
  class_id: string | null
  starts_at: string
  ends_at: string
  capacity: number
  note: string | null
  teacher_name: string
  class_name?: string
  bookings: { id: string; student_id: string; student_name: string }[]
}

export default function OudercontactPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // teacher/admin slot creation
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', start: '', end: '', class_id: '', capacity: '1', note: '' })
  const [saving, setSaving] = useState(false)
  const [myClasses, setMyClasses] = useState<any[]>([])

  // admin booking on behalf of a student
  const [students, setStudents] = useState<any[]>([])

  const role = profile?.role ?? ''
  const isStaff = ['teacher', 'admin', 'super_admin'].includes(role)
  const isAdmin = ['admin', 'super_admin'].includes(role)
  const isStudent = role === 'student'

  useEffect(() => {
    if (!profile) return
    load()
  }, [profile])

  async function load() {
    const tid = profile!.tenant_id

    const { data: slotRows } = await supabase
      .from('oudercontact_slots')
      .select('*')
      .order('starts_at', { ascending: true })

    const slotIds = (slotRows ?? []).map((s: any) => s.id)
    const teacherIds = Array.from(new Set((slotRows ?? []).map((s: any) => s.teacher_id)))
    const classIds = Array.from(new Set((slotRows ?? []).map((s: any) => s.class_id).filter(Boolean)))

    const [{ data: bookings }, { data: teachers }, { data: classRows }] = await Promise.all([
      slotIds.length
        ? supabase.from('oudercontact_bookings').select('id, slot_id, student_id').in('slot_id', slotIds)
        : Promise.resolve({ data: [] as any[] }),
      teacherIds.length
        ? supabase.from('profiles').select('id, first_name, last_name').in('id', teacherIds)
        : Promise.resolve({ data: [] as any[] }),
      classIds.length
        ? supabase.from('classes').select('id, name').in('id', classIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Resolve booking student names (separate query, RLS-safe)
    const studentIds = Array.from(new Set((bookings ?? []).map((b: any) => b.student_id)))
    const { data: bookStudents } = studentIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name').in('id', studentIds)
      : { data: [] as any[] }

    const teacherMap = Object.fromEntries((teachers ?? []).map((t: any) => [t.id, `${t.first_name} ${t.last_name}`]))
    const classMap = Object.fromEntries((classRows ?? []).map((c: any) => [c.id, c.name]))
    const studentMap = Object.fromEntries((bookStudents ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`]))

    const bookingsBySlot: Record<string, any[]> = {}
    for (const b of (bookings ?? [])) {
      if (!bookingsBySlot[b.slot_id]) bookingsBySlot[b.slot_id] = []
      bookingsBySlot[b.slot_id].push({ id: b.id, student_id: b.student_id, student_name: studentMap[b.student_id] ?? '—' })
    }

    setSlots((slotRows ?? []).map((s: any) => ({
      ...s,
      teacher_name: teacherMap[s.teacher_id] ?? '—',
      class_name: s.class_id ? classMap[s.class_id] : undefined,
      bookings: bookingsBySlot[s.id] ?? [],
    })))

    // Staff: load classes for the create form (teachers → own, admin → tenant)
    if (isStaff) {
      if (role === 'teacher') {
        const { data } = await supabase.from('class_teachers').select('classes(id, name)').eq('teacher_id', profile!.id)
        setMyClasses((data ?? []).map((r: any) => r.classes).filter(Boolean))
      } else {
        const { data } = await supabase.from('classes').select('id, name').eq('tenant_id', tid).eq('is_archived', false).order('name')
        setMyClasses(data ?? [])
      }
    }
    // Admin: students for booking-on-behalf
    if (isAdmin) {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name')
        .eq('tenant_id', tid).eq('role', 'student').eq('is_active', true).order('last_name')
      setStudents(data ?? [])
    }

    setLoading(false)
  }

  async function createSlot() {
    if (!form.date || !form.start || !form.end) { setError('Vul datum en tijd in.'); return }
    const startsAt = new Date(`${form.date}T${form.start}`)
    const endsAt = new Date(`${form.date}T${form.end}`)
    if (endsAt <= startsAt) { setError('Eindtijd moet na de starttijd liggen.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('oudercontact_slots').insert({
      tenant_id: profile!.tenant_id,
      teacher_id: profile!.id, // teacher creates own; admin creates as themselves
      class_id: form.class_id || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity: parseInt(form.capacity) || 1,
      note: form.note.trim() || null,
    })
    if (err) setError('Slot aanmaken mislukt.')
    else {
      setShowForm(false)
      setForm({ date: '', start: '', end: '', class_id: '', capacity: '1', note: '' })
      load()
    }
    setSaving(false)
  }

  async function deleteSlot(id: string) {
    if (!confirm('Dit slot en alle boekingen verwijderen?')) return
    await supabase.from('oudercontact_slots').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  async function book(slotId: string, studentId: string) {
    setError('')
    const { error: err } = await supabase.from('oudercontact_bookings').insert({
      slot_id: slotId,
      student_id: studentId,
      booked_by: profile!.id,
    })
    if (err) {
      setError(err.code === '23505' ? 'Deze leerling is al ingeschreven voor dit slot.' : 'Inschrijven mislukt.')
    } else {
      load()
    }
  }

  async function cancelBooking(bookingId: string) {
    await supabase.from('oudercontact_bookings').delete().eq('id', bookingId)
    load()
  }

  if (profileLoading || loading) return <PageLoader />

  const now = new Date()
  const upcoming = slots.filter(s => new Date(s.ends_at) >= now)

  return (
    <div className="animate-slide-up max-w-3xl">
      <div className="page-header flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">Oudercontact</h1>
          <p className="page-subtitle">
            {isStaff ? 'Tijdsloten voor oudergesprekken beheren' : 'Schrijf in voor een oudergesprek'}
          </p>
        </div>
        {isStaff && !showForm && (
          <button onClick={() => { setError(''); setShowForm(true) }} className="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0">
            <Plus size={14} /> Slot toevoegen
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">{error}</div>
      )}

      {/* Create form */}
      {isStaff && showForm && (
        <div className="card p-5 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Datum</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Van</label>
              <input type="time" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Tot</label>
              <input type="time" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Klas (optioneel)</label>
              <select value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))} className="input">
                <option value="">Geen specifieke klas</option>
                {myClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Capaciteit</label>
              <input type="number" min="1" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} className="input" />
            </div>
          </div>
          <input type="text" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
            placeholder="Notitie (optioneel, bv. lokaal)" className="input" />
          <div className="flex gap-2">
            <button onClick={createSlot} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aanmaken
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuleren</button>
          </div>
        </div>
      )}

      {/* Slot list */}
      {upcoming.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarClock size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Geen aankomende tijdsloten.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map(slot => {
            const full = slot.bookings.length >= slot.capacity
            const myBooking = slot.bookings.find(b => b.student_id === profile!.id)
            return (
              <div key={slot.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <CalendarClock size={18} className="text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 capitalize">
                      {format(new Date(slot.starts_at), 'EEEE d MMMM', { locale: nl })}
                      {' · '}
                      {format(new Date(slot.starts_at), 'HH:mm')}–{format(new Date(slot.ends_at), 'HH:mm')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {slot.teacher_name}
                      {slot.class_name && ` · ${slot.class_name}`}
                      {' · '}{slot.bookings.length}/{slot.capacity} ingeschreven
                      {slot.note && ` · ${slot.note}`}
                    </p>
                  </div>
                  {isStaff && (
                    <button onClick={() => deleteSlot(slot.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0" title="Verwijderen">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Student self-booking */}
                {isStudent && (
                  <div className="mt-3 pl-13">
                    {myBooking ? (
                      <button onClick={() => cancelBooking(myBooking.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 font-medium flex items-center gap-1.5 hover:bg-green-100 transition-colors">
                        <Check size={12} /> Ingeschreven — annuleren
                      </button>
                    ) : (
                      <button onClick={() => book(slot.id, profile!.id)} disabled={full}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          full ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                               : 'border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100'
                        }`}>
                        {full ? 'Volzet' : 'Inschrijven'}
                      </button>
                    )}
                  </div>
                )}

                {/* Staff: see bookings; admin: book on behalf */}
                {isStaff && (
                  <div className="mt-3 pl-13 space-y-1.5">
                    {slot.bookings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {slot.bookings.map(b => (
                          <span key={b.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 rounded-full pl-2 pr-1 py-0.5">
                            <Users size={10} /> {b.student_name}
                            {isAdmin && (
                              <button onClick={() => cancelBooking(b.id)} className="text-gray-400 hover:text-red-500" title="Verwijderen">
                                <X size={11} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {isAdmin && !full && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) book(slot.id, e.target.value) }}
                        className="input text-xs py-1.5 w-auto max-w-full"
                      >
                        <option value="">+ Leerling inschrijven…</option>
                        {students
                          .filter(s => !slot.bookings.some(b => b.student_id === s.id))
                          .map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
