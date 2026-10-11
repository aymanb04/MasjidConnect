'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, LoadError } from '@/components/ui/PageShell'
import { getDeadlineLabel } from '@/lib/utils'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarPlus, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import EventModal, { type CalendarEvent } from '@/components/features/agenda/EventModal'

const DAY_HEADERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function mondayOffset(d: Date) {
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

// 'YYYY-MM-DD' in lokale tijd, zoals starts_on/ends_on in de database staan.
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }

function eventWhen(e: CalendarEvent): string {
  const short = (k: string) => fromKey(k).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
  const date = e.starts_on === e.ends_on ? short(e.starts_on) : `${short(e.starts_on)} – ${short(e.ends_on)}`
  if (!e.start_time) return date
  return `${date} · ${e.start_time.slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ''}`
}

export default function AgendaPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  // Activiteiten (migratie 42). RLS geeft enkel wat deze gebruiker mag zien.
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [adminGroups, setAdminGroups] = useState<{ id: string; name: string }[]>([])
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<unknown>(null)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    loadAssignments()
  }, [profile])

  async function loadAssignments() {
    const supabase = getSupabase()
    setLoading(true)
    setLoadErr(null)
    let data: any[] = []

    if (profile!.role === 'student') {
      const { data: enr, error: enrErr } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', profile!.id)
      if (enrErr) { console.error(enrErr); setLoadErr(enrErr); setLoading(false); return }
      const ids = enr?.map((e: any) => e.class_id) ?? []
      if (ids.length > 0) {
        const { data: a, error: aErr } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .eq('is_published', true)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        if (aErr) { console.error(aErr); setLoadErr(aErr); setLoading(false); return }
        data = a ?? []
      }
    } else if (profile!.role === 'teacher') {
      const { data: t, error: tErr } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile!.id)
      if (tErr) { console.error(tErr); setLoadErr(tErr); setLoading(false); return }
      const ids = t?.map((x: any) => x.class_id) ?? []
      if (ids.length > 0) {
        const { data: a, error: aErr } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        if (aErr) { console.error(aErr); setLoadErr(aErr); setLoading(false); return }
        data = a ?? []
      }
    } else {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_archived', false)
      if (clsErr) { console.error(clsErr); setLoadErr(clsErr); setLoading(false); return }
      const ids = cls?.map((c: any) => c.id) ?? []
      if (ids.length > 0) {
        const { data: a, error: aErr } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        if (aErr) { console.error(aErr); setLoadErr(aErr); setLoading(false); return }
        data = a ?? []
      }
    }

    setAssignments(data)
    await loadEvents()
    setLoading(false)
  }

  async function loadEvents() {
    const supabase = getSupabase()
    const { data: ev, error: evErr } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('tenant_id', profile!.tenant_id)
      .order('starts_on', { ascending: true })
    // Geen activiteiten is geen reden om de deadlines niet te tonen.
    if (evErr) { console.error(evErr); setEvents([]); return }
    setEvents(ev ?? [])

    if (profile!.role === 'admin' || profile!.role === 'super_admin') {
      const { data: years } = await supabase.from('school_years').select('id')
        .eq('tenant_id', profile!.tenant_id).eq('is_active', true)
      const yearIds = (years ?? []).map((y: any) => y.id)
      const { data: gs } = yearIds.length
        ? await supabase.from('groups').select('id, name').in('school_year_id', yearIds)
        : { data: [] as any[] }
      const coll = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' })
      setAdminGroups((gs ?? []).sort((a: any, b: any) => coll.compare(a.name, b.name)))
    }
    // Groepsnamen apart ophalen: een geneste join over RLS-tabellen geeft hier
    // stilzwijgend niets terug.
    const ids = Array.from(new Set((ev ?? []).map((e: any) => e.group_id).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: g } = await supabase.from('groups').select('id, name').in('id', ids)
      setGroupNames(Object.fromEntries((g ?? []).map((x: any) => [x.id, x.name])))
    }
  }

  if (profileLoading || loading) return <PageLoader />
  if (loadErr) return (
    <div className="animate-slide-up">
      <div className="page-header"><h1 className="page-title">Agenda</h1></div>
      <LoadError error={loadErr} onRetry={loadAssignments} retrying={loading} />
    </div>
  )

  // Enkel beheer van een school: super_admin heeft geen eigen tenant om in te schrijven.
  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role !== 'student'
  const today = new Date()
  const todayKey = dayKey(today)
  const totalDays = daysInMonth(currentMonth)
  const offset = mondayOffset(currentMonth)

  const assignmentsByDay: Record<number, any[]> = {}
  assignments.forEach(a => {
    if (!a.due_date) return
    const d = new Date(a.due_date)
    if (d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth()) {
      const day = d.getDate()
      if (!assignmentsByDay[day]) assignmentsByDay[day] = []
      assignmentsByDay[day].push(a)
    }
  })

  const keyOf = (day: number) => dayKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))
  const eventsOn = (key: string) => events.filter(e => e.starts_on <= key && e.ends_on >= key)

  const monthLabel = currentMonth.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  function prevMonth() {
    setSelectedDay(null)
    setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))
  }
  function nextMonth() {
    setSelectedDay(null)
    setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))
  }
  function toggleDay(day: number) {
    setSelectedDay(prev => (prev === day ? null : day))
  }

  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const isCurrentMonthView = todayYear === currentMonth.getFullYear() && todayMonth === currentMonth.getMonth()

  let listAssignments: any[]
  let listEvents: CalendarEvent[]
  if (selectedDay !== null) {
    listAssignments = (assignmentsByDay[selectedDay] ?? [])
    listEvents = eventsOn(keyOf(selectedDay))
  } else {
    // Local date, not UTC. toISOString() rolls over at 00:00 UTC, so in
    // Europe/Brussels every evening after 22:00 (23:00 in summer) this produced
    // TOMORROW's date and silently dropped today's deadlines out of
    // "Komende taken" — exactly when a student checks what is due.
    listAssignments = assignments
      .filter(a => a.due_date && a.due_date >= todayKey)
      .slice(0, 25)
    // Ook wat vandaag nog loopt, zoals een vakantie die al begonnen is.
    listEvents = events.filter(e => e.ends_on >= todayKey).slice(0, 25)
  }

  // Activiteiten en deadlines in een lijst, op datum. Een lopende activiteit
  // staat bij vandaag, niet bij haar verstreken begindatum.
  const listItems = [
    ...listEvents.map(e => ({
      kind: 'event' as const,
      key: (selectedDay === null && e.starts_on < todayKey ? todayKey : e.starts_on) + 'T' + (e.start_time ?? '00:00'),
      e,
    })),
    ...listAssignments.map(a => ({ kind: 'deadline' as const, key: format(new Date(a.due_date), "yyyy-MM-dd'T'HH:mm"), a })),
  ].sort((x, y) => x.key.localeCompare(y.key))
  const newEventDate = selectedDay !== null ? keyOf(selectedDay) : todayKey

  const cells = Array.from({ length: offset + totalDays })

  return (
    <div className="animate-slide-up">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle">Activiteiten en deadlines</p>
        </div>
        {isAdmin && (
          <button onClick={() => setEditing('new')} className="btn-primary">
            <CalendarPlus size={16} /> Activiteit toevoegen
          </button>
        )}
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <button onClick={prevMonth} className="btn-secondary p-2" aria-label="Vorige maand">
            <ChevronLeft size={18} />
          </button>
          <span className="font-semibold text-gray-900 text-base">{monthLabelCapitalized}</span>
          <button onClick={nextMonth} className="btn-secondary p-2" aria-label="Volgende maand">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-xs font-medium text-gray-400 py-1">{h}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((_, i) => {
            const day = i - offset + 1
            if (day < 1) return <div key={i} />
            const isToday = isCurrentMonthView && day === todayDay
            const isSelected = selectedDay === day
            const hasDot = !!assignmentsByDay[day]?.length
            const dayEvents = eventsOn(keyOf(day))
            const isClosed = dayEvents.some(e => e.is_closure)
            return (
              <button
                key={i}
                onClick={() => toggleDay(day)}
                className={[
                  'flex flex-col items-center justify-center rounded-xl h-10 w-full text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-primary-600 text-white'
                    : isToday
                    ? 'bg-primary-50 text-primary-700'
                    : isClosed
                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'hover:bg-gray-100 text-gray-700',
                ].join(' ')}
              >
                <span>{day}</span>
                {(hasDot || dayEvents.length > 0) && (
                  <span className="flex gap-0.5 mt-0.5">
                    {hasDot && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-primary-500'}`} />}
                    {dayEvents.length > 0 && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-500'}`} />}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary-500" /> Deadline</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Activiteit</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> Geen les</span>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">
          {selectedDay !== null
            ? `${selectedDay} ${currentMonth.toLocaleDateString('nl-BE', { month: 'long' })}`
            : 'Komend'}
        </h2>
        {listItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Niets gepland.</p>
        ) : (
          <div className="space-y-2">
            {listItems.map(item => {
              if (item.kind === 'event') {
                const e = item.e
                const badge = e.is_closure ? 'Geen les'
                  : e.audience === 'teachers' ? 'Enkel personeel'
                  : e.audience === 'group' ? (groupNames[e.group_id!] ?? 'Groep')
                  : null
                const body = (
                  <>
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${e.is_closure ? 'bg-amber-100' : 'bg-amber-50'}`}>
                      <CalendarDays size={15} className="text-amber-600" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">{e.title}</div>
                      <div className="text-xs text-gray-500">{eventWhen(e)}</div>
                      {e.description && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap line-clamp-3">{e.description}</div>}
                    </div>
                    {badge && <span className="badge flex-shrink-0 bg-amber-100 text-amber-800">{badge}</span>}
                  </>
                )
                return isAdmin ? (
                  <button key={`e-${e.id}`} onClick={() => setEditing(e)} title="Bewerken"
                    className="w-full text-left flex items-start gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50 transition-all">
                    {body}
                  </button>
                ) : (
                  <div key={`e-${e.id}`} className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
                    {body}
                  </div>
                )
              }
              const a = item.a
              const dl = getDeadlineLabel(a.due_date)
              const color = a.classes?.color ?? '#1B6B4A'
              return (
                <Link
                  key={a.id}
                  href={`/huiswerk/${a.id}`}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 truncate">
                      {a.title}
                    </div>
                    <div className="text-xs text-gray-400">
                      {a.classes?.name}
                      {isStaff && !a.is_published && <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Concept</span>}
                    </div>
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${dl.color}`}>{dl.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {editing && profile && (
        <EventModal
          tenantId={profile.tenant_id}
          userId={profile.id}
          event={editing === 'new' ? null : editing}
          defaultDate={newEventDate}
          groups={adminGroups}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await loadEvents() }}
        />
      )}
    </div>
  )
}
