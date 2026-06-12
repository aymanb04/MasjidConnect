'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { CheckCircle2, XCircle, Clock, FileCheck, ArrowLeft, Loader2, Users, ChevronRight, AlertTriangle, X } from 'lucide-react'
import type { AttendanceStatus } from '@/lib/types'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string; bg: string; icon: typeof CheckCircle2 }[] = [
  { value: 'present',  label: 'Aanwezig',         color: 'text-green-600',  bg: 'bg-green-50 border-green-200 hover:bg-green-100',  icon: CheckCircle2 },
  { value: 'absent',   label: 'Afwezig',           color: 'text-red-500',   bg: 'bg-red-50 border-red-200 hover:bg-red-100',        icon: XCircle },
  { value: 'late',     label: 'Te laat',           color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',  icon: Clock },
  { value: 'excused',  label: 'Verontschuldigd',   color: 'text-blue-500',  bg: 'bg-blue-50 border-blue-200 hover:bg-blue-100',    icon: FileCheck },
]

const STATUS_BADGE: Record<AttendanceStatus, { label: string; color: string }> = {
  present: { label: 'Aanwezig',       color: 'bg-green-100 text-green-700' },
  absent:  { label: 'Afwezig',        color: 'bg-red-100 text-red-600' },
  late:    { label: 'Te laat',        color: 'bg-amber-100 text-amber-700' },
  excused: { label: 'Verontschuldigd', color: 'bg-blue-100 text-blue-700' },
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassItem {
  id: string
  name: string
  color: string
  group_name?: string
  school_year_name?: string
}

interface StudentItem {
  id: string
  first_name: string
  last_name: string
}

interface SessionItem {
  id: string
  session_date: string
  teacher_name: string
  present: number
  absent: number
  late: number
  excused: number
  total: number
}

interface RecordItem {
  student_id: string
  student_name: string
  status: AttendanceStatus
  note?: string
}

type View =
  | { type: 'classes' }
  | { type: 'mark';    cls: ClassItem }
  | { type: 'history'; cls: ClassItem }
  | { type: 'session'; cls: ClassItem; session: SessionItem }
  | { type: 'my_records' }

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AanwezigheidPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [view,    setView]    = useState<View>({ type: 'classes' })
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) loadClasses()
  }, [profile])

  async function loadClasses() {
    setLoading(true)
    const role = profile!.role

    if (role === 'student') {
      const { data } = await supabase
        .from('class_students')
        .select('classes(id, name, color, groups(name), school_years(name))')
        .eq('student_id', profile!.id)
      setClasses(
        (data ?? []).map((r: any) => ({
          id: r.classes.id, name: r.classes.name, color: r.classes.color,
          group_name: r.classes.groups?.name, school_year_name: r.classes.school_years?.name,
        }))
      )
    } else if (role === 'teacher') {
      const { data } = await supabase
        .from('class_teachers')
        .select('classes(id, name, color, groups(name), school_years(name))')
        .eq('teacher_id', profile!.id)
      setClasses(
        (data ?? []).map((r: any) => ({
          id: r.classes.id, name: r.classes.name, color: r.classes.color,
          group_name: r.classes.groups?.name, school_year_name: r.classes.school_years?.name,
        }))
      )
    } else {
      // admin / super_admin
      const { data } = await supabase
        .from('classes')
        .select('id, name, color, groups(name), school_years(name)')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_archived', false)
        .order('name')
      setClasses(
        (data ?? []).map((c: any) => ({
          id: c.id, name: c.name, color: c.color,
          group_name: c.groups?.name, school_year_name: c.school_years?.name,
        }))
      )
    }
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  return (
    <div className="animate-slide-up max-w-3xl">
      {/* Header */}
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title">Aanwezigheid</h1>
          <p className="page-subtitle">
            {profile!.role === 'student'
              ? 'Jouw aanwezigheidsoverzicht per klas'
              : profile!.role === 'teacher'
              ? 'Aanwezigheid markeren en bekijken'
              : 'Aanwezigheidsoverzicht van alle klassen'}
          </p>
        </div>
      </div>

      {/* ── Class list ── */}
      {view.type === 'classes' && (
        <ClassListView
          classes={classes}
          profile={profile!}
          onSelectForMarking={cls  => setView({ type: 'mark',    cls })}
          onSelectForHistory={cls  => setView({ type: 'history', cls })}
          onSelectMyRecords={()    => setView({ type: 'my_records' })}
        />
      )}

      {/* ── Mark attendance (today) ── */}
      {view.type === 'mark' && (
        <MarkAttendanceView
          cls={view.cls}
          profile={profile!}
          onBack={() => setView({ type: 'classes' })}
        />
      )}

      {/* ── History per class ── */}
      {view.type === 'history' && (
        <HistoryView
          cls={view.cls}
          onBack={() => setView({ type: 'classes' })}
          onSelectSession={session => setView({ type: 'session', cls: view.cls, session })}
        />
      )}

      {/* ── Session detail ── */}
      {view.type === 'session' && (
        <SessionDetailView
          session={view.session}
          cls={view.cls}
          onBack={() => setView({ type: 'history', cls: view.cls })}
        />
      )}

      {/* ── Student's own records ── */}
      {view.type === 'my_records' && (
        <MyRecordsView
          profile={profile!}
          classes={classes}
          onBack={() => setView({ type: 'classes' })}
        />
      )}
    </div>
  )
}

// ─── ClassListView ────────────────────────────────────────────────────────────

function ClassListView({
  classes, profile,
  onSelectForMarking, onSelectForHistory, onSelectMyRecords,
}: {
  classes: ClassItem[]
  profile: any
  onSelectForMarking: (c: ClassItem) => void
  onSelectForHistory: (c: ClassItem) => void
  onSelectMyRecords: () => void
}) {
  const isStudent = profile.role === 'student'
  const canMark   = ['teacher', 'admin', 'super_admin'].includes(profile.role)
  const today     = format(new Date(), 'yyyy-MM-dd')

  // Track which classes already have a session today
  const [doneTodayIds, setDoneTodayIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!canMark || classes.length === 0) return
    const ids = classes.map(c => c.id)
    supabase
      .from('attendance_sessions')
      .select('class_id')
      .in('class_id', ids)
      .eq('session_date', today)
      .then(({ data }) => {
        setDoneTodayIds(new Set((data ?? []).map((r: any) => r.class_id)))
      })
  }, [classes])

  if (classes.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Users size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500">Je bent niet ingeschreven in een klas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Student — single card with link to own records */}
      {isStudent && (
        <button
          onClick={onSelectMyRecords}
          className="w-full card p-5 flex items-center gap-4 hover:border-primary-200 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Mijn aanwezigheid</p>
            <p className="text-sm text-gray-400">Bekijk jouw aanwezigheidsoverzicht per klas</p>
          </div>
          <ChevronRight size={16} className="text-gray-300" />
        </button>
      )}

      {/* Class cards */}
      <div className="card divide-y divide-border overflow-hidden">
        {classes.map(cls => {
          const doneToday = doneTodayIds.has(cls.id)
          return (
            <div key={cls.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: cls.color }}
              >
                {cls.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{cls.name}</p>
                <p className="text-xs text-gray-400">
                  {[cls.group_name, cls.school_year_name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canMark && (
                  <button
                    onClick={() => onSelectForMarking(cls)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      doneToday
                        ? 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                        : 'border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100'
                    }`}
                  >
                    {doneToday ? '✓ Aanpassen' : 'Markeren'}
                  </button>
                )}
                {!isStudent && (
                  <button
                    onClick={() => onSelectForHistory(cls)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Overzicht
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MarkAttendanceView ───────────────────────────────────────────────────────

function MarkAttendanceView({ cls, profile, onBack }: { cls: ClassItem; profile: any; onBack: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [date,      setDate]      = useState(today) // selectable: retroactive entry allowed, future blocked
  const [students,  setStudents]  = useState<StudentItem[]>([])
  const [statuses,  setStatuses]  = useState<Record<string, AttendanceStatus>>({})
  const [existing,  setExisting]  = useState<string | null>(null) // session id if already exists
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)
  const [prevAbsent,    setPrevAbsent]    = useState<{ date: string; names: string[] } | null>(null)
  const [prevDismissed, setPrevDismissed] = useState(false)

  useEffect(() => {
    setLoading(true)
    setExisting(null)
    setPrevDismissed(false)
    loadData()
  }, [date])

  async function loadData() {
    // Check for existing session on the selected date
    const { data: sess } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('class_id', cls.id)
      .eq('session_date', date)
      .maybeSingle()

    let initStatuses: Record<string, AttendanceStatus> = {}

    if (sess) {
      setExisting(sess.id)
      // Load existing records
      const { data: records } = await supabase
        .from('attendance_records')
        .select('student_id, status')
        .eq('session_id', sess.id)
      for (const r of (records ?? [])) {
        initStatuses[r.student_id] = r.status as AttendanceStatus
      }
    }

    // Load enrolled students
    const { data: links } = await supabase
      .from('class_students')
      .select('profiles(id, first_name, last_name)')
      .eq('class_id', cls.id)
    const studs: StudentItem[] = (links ?? [])
      .map((l: any) => l.profiles)
      .filter(Boolean)
      .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name))

    setStudents(studs)

    // Who was absent in the most recent session before this date?
    const { data: prevSess } = await supabase
      .from('attendance_sessions')
      .select('id, session_date')
      .eq('class_id', cls.id)
      .lt('session_date', date)
      .order('session_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (prevSess) {
      const { data: prevRecs } = await supabase
        .from('attendance_records')
        .select('status, profiles!attendance_records_student_id_fkey(first_name, last_name)')
        .eq('session_id', prevSess.id)
        .eq('status', 'absent')
      const names = (prevRecs ?? [])
        .map((r: any) => r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : null)
        .filter(Boolean) as string[]
      setPrevAbsent(names.length ? { date: prevSess.session_date, names } : null)
    } else {
      setPrevAbsent(null)
    }

    // Default all to 'present' for new sessions
    if (!sess) {
      for (const s of studs) initStatuses[s.id] = 'present'
    } else {
      // Fill in any students not yet in records with 'present'
      for (const s of studs) {
        if (!initStatuses[s.id]) initStatuses[s.id] = 'present'
      }
    }

    setStatuses(initStatuses)
    setLoading(false)
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatuses(prev => ({ ...prev, [studentId]: status }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      let sessionId = existing

      if (!sessionId) {
        // Create new session (selected date may be in the past — backfill)
        const { data: sess, error } = await supabase
          .from('attendance_sessions')
          .insert({ class_id: cls.id, teacher_id: profile.id, session_date: date })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        sessionId = sess.id
      }

      // Upsert all records
      const records = students.map(s => ({
        session_id: sessionId!,
        student_id: s.id,
        status: statuses[s.id] ?? 'present',
      }))

      const { error: recErr } = await supabase
        .from('attendance_records')
        .upsert(records, { onConflict: 'session_id,student_id' })

      if (recErr) throw new Error(recErr.message)

      setDone(true)
      setTimeout(onBack, 1500)
    } catch (err: any) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const presentCount  = Object.values(statuses).filter(s => s === 'present').length
  const absentCount   = Object.values(statuses).filter(s => s === 'absent').length
  const lateCount     = Object.values(statuses).filter(s => s === 'late').length
  const excusedCount  = Object.values(statuses).filter(s => s === 'excused').length

  return (
    <div>
      {/* Back + title */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={15} /> Terug
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
          style={{ backgroundColor: cls.color }}
        >
          {cls.name[0]}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">{cls.name}</h2>
          <p className="text-sm text-gray-400 capitalize">
            {format(new Date(date), 'EEEE d MMMM yyyy', { locale: nl })}
          </p>
        </div>
        {existing && (
          <span className="ml-auto text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-lg">
            Aanpassen
          </span>
        )}
      </div>

      {/* Date picker — backfill a missed day (future dates blocked) */}
      <div className="flex items-center gap-2 mb-5">
        <label htmlFor="attendance-date" className="text-sm text-gray-500">Datum:</label>
        <input
          id="attendance-date"
          type="date"
          value={date}
          max={today}
          onChange={e => { if (e.target.value && e.target.value <= today) setDate(e.target.value) }}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {date !== today && (
          <button
            onClick={() => setDate(today)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            Vandaag
          </button>
        )}
      </div>

      {done ? (
        <div className="card p-8 flex flex-col items-center gap-2">
          <CheckCircle2 size={40} className="text-primary-500" />
          <p className="font-semibold text-gray-900">Aanwezigheid opgeslagen!</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Laden…
        </div>
      ) : students.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Geen leerlingen ingeschreven in deze klas.
        </div>
      ) : (
        <>
          {/* Last-session absentees (feedback: popup of who was absent last week) */}
          {prevAbsent && !prevDismissed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 mb-4 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-amber-800">
                <p className="font-medium mb-0.5">
                  Afwezig op de vorige sessie ({format(new Date(prevAbsent.date), 'EEE d MMM', { locale: nl })}):
                </p>
                <p>{prevAbsent.names.join(', ')}</p>
              </div>
              <button
                onClick={() => setPrevDismissed(true)}
                className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
                aria-label="Sluiten"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Aanwezig',       count: presentCount, color: 'text-green-600 bg-green-50' },
              { label: 'Afwezig',        count: absentCount,  color: 'text-red-500  bg-red-50'   },
              { label: 'Te laat',        count: lateCount,    color: 'text-amber-500 bg-amber-50' },
              { label: 'Veront.',        count: excusedCount, color: 'text-blue-500 bg-blue-50'  },
            ].map(s => (
              <div key={s.label} className={`rounded-xl px-2 py-2 text-center ${s.color}`}>
                <div className="text-xl font-bold">{s.count}</div>
                <div className="text-xs font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Student list */}
          <div className="card divide-y divide-border overflow-hidden mb-4">
            {students.map(student => {
              const current = statuses[student.id] ?? 'present'
              return (
                <div key={student.id} className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-800 flex-1">
                      {student.first_name} {student.last_name}
                    </span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {STATUS_OPTIONS.map(opt => {
                      const Icon = opt.icon
                      const active = current === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setStatus(student.id, opt.value)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            active ? `${opt.bg} ${opt.color} font-semibold` : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <Icon size={11} />
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {saving
              ? <><Loader2 size={15} className="animate-spin" /> Opslaan…</>
              : <><CheckCircle2 size={15} /> Aanwezigheid opslaan</>
            }
          </button>
        </>
      )}
    </div>
  )
}

// ─── HistoryView ──────────────────────────────────────────────────────────────

function HistoryView({
  cls, onBack, onSelectSession,
}: {
  cls: ClassItem
  onBack: () => void
  onSelectSession: (s: SessionItem) => void
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'sessions' | 'students'>('sessions')

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, teacher_id, profiles!attendance_sessions_teacher_id_fkey(first_name, last_name)')
      .eq('class_id', cls.id)
      .order('session_date', { ascending: false })
      .limit(30)

    if (!data || data.length === 0) { setLoading(false); return }

    const sessionIds = data.map((s: any) => s.id)
    const { data: records } = await supabase
      .from('attendance_records')
      .select('session_id, status')
      .in('session_id', sessionIds)

    // Group records by session
    const rMap: Record<string, AttendanceStatus[]> = {}
    for (const r of (records ?? [])) {
      if (!rMap[r.session_id]) rMap[r.session_id] = []
      rMap[r.session_id].push(r.status)
    }

    setSessions(data.map((s: any) => {
      const recs = rMap[s.id] ?? []
      const t = (s as any).profiles
      return {
        id:           s.id,
        session_date: s.session_date,
        teacher_name: t ? `${t.first_name} ${t.last_name}` : '—',
        present:  recs.filter(r => r === 'present').length,
        absent:   recs.filter(r => r === 'absent').length,
        late:     recs.filter(r => r === 'late').length,
        excused:  recs.filter(r => r === 'excused').length,
        total:    recs.length,
      }
    }))
    setLoading(false)
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={15} /> Terug
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
          style={{ backgroundColor: cls.color }}
        >
          {cls.name[0]}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">{cls.name} — Aanwezigheidshistoriek</h2>
          <p className="text-sm text-gray-400">
            {tab === 'sessions' ? 'Laatste 30 sessies' : 'Heel schooljaar, per leerling'}
          </p>
        </div>
      </div>

      {/* Tabs: per session / per student (year overview) */}
      <div className="flex gap-1.5 mb-4">
        {([['sessions', 'Sessies'], ['students', 'Per leerling']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'students' ? (
        <StudentStatsView cls={cls} />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Laden…
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Nog geen aanwezigheid geregistreerd voor deze klas.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {sessions.map(sess => {
            const dateLabel = format(new Date(sess.session_date), 'EEEE d MMMM yyyy', { locale: nl })
            const pct = sess.total ? Math.round((sess.present / sess.total) * 100) : 0
            return (
              <button
                key={sess.id}
                onClick={() => onSelectSession(sess)}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 capitalize">{dateLabel}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sess.teacher_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                  <span className="text-green-600 font-medium">{sess.present}✓</span>
                  {sess.absent  > 0 && <span className="text-red-500">{sess.absent}✗</span>}
                  {sess.late    > 0 && <span className="text-amber-500">{sess.late}⏰</span>}
                  {sess.excused > 0 && <span className="text-blue-500">{sess.excused}📋</span>}
                  <span className="text-gray-400 ml-1">{pct}%</span>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── StudentStatsView (year overview per student) ─────────────────────────────

interface StudentStat {
  id: string
  name: string
  present: number
  absent: number
  late: number
  excused: number
  total: number
  streak: boolean // absent in the 2 most recent sessions
}

function StudentStatsView({ cls }: { cls: ClassItem }) {
  const [rows,         setRows]         = useState<StudentStat[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    // All sessions of this class (the class itself is bound to one school year)
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('id, session_date')
      .eq('class_id', cls.id)
      .order('session_date', { ascending: false })

    const sessionIds = (sessions ?? []).map((s: any) => s.id)
    setSessionCount(sessionIds.length)

    // Roster
    const { data: links } = await supabase
      .from('class_students')
      .select('profiles(id, first_name, last_name)')
      .eq('class_id', cls.id)
    const students = (links ?? [])
      .map((l: any) => l.profiles)
      .filter(Boolean)
      .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name))

    // Records — chunked so a full year × full class stays under PostgREST's row cap
    const records: { session_id: string; student_id: string; status: AttendanceStatus }[] = []
    for (let i = 0; i < sessionIds.length; i += 20) {
      const { data } = await supabase
        .from('attendance_records')
        .select('session_id, student_id, status')
        .in('session_id', sessionIds.slice(i, i + 20))
      records.push(...((data ?? []) as any))
    }

    const lastTwo = sessionIds.slice(0, 2)
    setRows(students.map((st: any) => {
      const mine = records.filter(r => r.student_id === st.id)
      const count = (s: AttendanceStatus) => mine.filter(r => r.status === s).length
      const streak = lastTwo.length === 2 &&
        lastTwo.every(sid => mine.some(r => r.session_id === sid && r.status === 'absent'))
      return {
        id: st.id,
        name: `${st.first_name} ${st.last_name}`,
        present: count('present'), absent: count('absent'),
        late: count('late'), excused: count('excused'),
        total: mine.length, streak,
      }
    }))
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Laden…
      </div>
    )
  }

  if (sessionCount === 0 || rows.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-400 text-sm">
        Nog geen aanwezigheid geregistreerd voor deze klas.
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{sessionCount} sessies geregistreerd</p>
      <div className="card divide-y divide-border overflow-hidden">
        {rows.map(r => {
          const pct = r.total ? Math.round((r.present / r.total) * 100) : 0
          const pctColor = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-500' : 'text-red-500'
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {r.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                  {r.name}
                  {r.streak && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                      <AlertTriangle size={10} /> laatste 2 sessies afwezig
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {r.total === 0
                    ? 'Geen records'
                    : [
                        `${r.present}× aanwezig`,
                        r.absent  > 0 && `${r.absent}× afwezig`,
                        r.late    > 0 && `${r.late}× te laat`,
                        r.excused > 0 && `${r.excused}× verontschuldigd`,
                      ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {r.total > 0 && (
                <span className={`text-sm font-semibold flex-shrink-0 ${pctColor}`}>{pct}%</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SessionDetailView ────────────────────────────────────────────────────────

function SessionDetailView({
  session, cls, onBack,
}: {
  session: SessionItem
  cls: ClassItem
  onBack: () => void
}) {
  const [records, setRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRecords() }, [])

  async function loadRecords() {
    const { data } = await supabase
      .from('attendance_records')
      .select('student_id, status, profiles!attendance_records_student_id_fkey(first_name, last_name)')
      .eq('session_id', session.id)
      .order('status')

    setRecords(
      (data ?? []).map((r: any) => ({
        student_id:   r.student_id,
        student_name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : '—',
        status:       r.status,
      }))
    )
    setLoading(false)
  }

  const dateLabel = format(new Date(session.session_date), 'EEEE d MMMM yyyy', { locale: nl })

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={15} /> Terug naar overzicht
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
          style={{ backgroundColor: cls.color }}
        >
          {cls.name[0]}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 capitalize">{dateLabel}</h2>
          <p className="text-sm text-gray-400">{cls.name} · {session.teacher_name}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Aanwezig',  count: session.present,  color: 'text-green-600 bg-green-50' },
          { label: 'Afwezig',   count: session.absent,   color: 'text-red-500 bg-red-50'     },
          { label: 'Te laat',   count: session.late,     color: 'text-amber-500 bg-amber-50' },
          { label: 'Veront.',   count: session.excused,  color: 'text-blue-500 bg-blue-50'   },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-2 py-2 text-center ${s.color}`}>
            <div className="text-xl font-bold">{s.count}</div>
            <div className="text-xs font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Laden…
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {records.map(rec => {
            const badge = STATUS_BADGE[rec.status]
            return (
              <div key={rec.student_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {rec.student_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <span className="flex-1 text-sm text-gray-800">{rec.student_name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MyRecordsView (student) ──────────────────────────────────────────────────

function MyRecordsView({
  profile, classes, onBack,
}: {
  profile: any
  classes: ClassItem[]
  onBack: () => void
}) {
  const [records,  setRecords]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [classFilter, setClassFilter] = useState<string>('all')

  useEffect(() => { loadMyRecords() }, [])

  async function loadMyRecords() {
    // Split into separate queries to avoid the nested-join + RLS silent-failure
    // gotcha: attendance_sessions RLS does a subquery to class_students (also
    // RLS-protected), which causes nested PostgREST joins to silently return [].

    // 1. My attendance records (whole year — a student has at most a few
    // hundred records, well under the PostgREST row cap)
    const { data: recs } = await supabase
      .from('attendance_records')
      .select('status, session_id')
      .eq('student_id', profile.id)

    if (!recs || recs.length === 0) { setLoading(false); return }

    // 2. The sessions those records belong to
    const sessionIds = Array.from(new Set(recs.map((r: any) => r.session_id)))
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, class_id')
      .in('id', sessionIds)
      .order('session_date', { ascending: false })

    // 3. The classes for those sessions
    const classIds = Array.from(new Set((sessions ?? []).map((s: any) => s.class_id)))
    const { data: classRows } = classIds.length
      ? await supabase.from('classes').select('id, name, color').in('id', classIds)
      : { data: [] }

    // Merge into a flat structure mirroring the old shape
    const sessMap  = Object.fromEntries((sessions  ?? []).map((s: any) => [s.id, s]))
    const classMap = Object.fromEntries((classRows ?? []).map((c: any) => [c.id, c]))

    const merged = recs.map((r: any) => {
      const sess = sessMap[r.session_id]
      return {
        ...r,
        attendance_sessions: sess
          ? { ...sess, classes: classMap[sess.class_id] ?? null }
          : null,
      }
    }).sort((a: any, b: any) => {
      const da = a.attendance_sessions?.session_date ?? ''
      const db = b.attendance_sessions?.session_date ?? ''
      return db.localeCompare(da)
    })

    setRecords(merged)
    setLoading(false)
  }

  const filtered = classFilter === 'all'
    ? records
    : records.filter((r: any) => r.attendance_sessions?.class_id === classFilter)

  const totalPresent  = records.filter((r: any) => r.status === 'present').length
  const totalAbsent   = records.filter((r: any) => r.status === 'absent').length
  const pct = records.length ? Math.round((totalPresent / records.length) * 100) : 0

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={15} /> Terug
      </button>

      <h2 className="font-semibold text-gray-900 mb-1">Mijn aanwezigheid</h2>
      <p className="text-sm text-gray-400 mb-5">
        {records.length} sessies · {pct}% aanwezig
        {totalAbsent > 0 && ` · ${totalAbsent}× afwezig`}
      </p>

      {/* Class filter */}
      {classes.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          <button
            onClick={() => setClassFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${classFilter === 'all' ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Alle
          </button>
          {classes.map(cls => (
            <button
              key={cls.id}
              onClick={() => setClassFilter(cls.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${classFilter === cls.id ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cls.color }} />
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Laden…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Geen aanwezigheidsrecords gevonden.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {filtered.map((rec: any, i: number) => {
            const sess = rec.attendance_sessions
            const dateLabel = format(new Date(sess.session_date), 'EEE d MMM yyyy', { locale: nl })
            const badge = STATUS_BADGE[rec.status as AttendanceStatus]
            const cls = sess?.classes
            return (
              <div key={`${sess.class_id}_${sess.session_date}_${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 capitalize">{dateLabel}</p>
                  {cls && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cls.color }} />
                      {cls.name}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
