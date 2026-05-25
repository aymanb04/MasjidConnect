'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import {
  Calendar, Plus, ChevronDown, ChevronUp, CheckCircle2,
  Loader2, ArrowRight, Users, GraduationCap,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolYear {
  id: string
  tenant_id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

interface ClassWithMembers {
  id: string
  name: string
  description: string | null
  color: string | null
  group_id: string | null
  school_year_id: string
  teachers: { id: string; first_name: string; last_name: string }[]
  students: { id: string; first_name: string; last_name: string }[]
  groupName: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function JaarovergangPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [loading, setLoading] = useState(true)
  const [activeYear, setActiveYear] = useState<SchoolYear | null>(null)

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newYearForm, setNewYearForm] = useState({ name: '', start_date: '', end_date: '' })
  const [creating, setCreating] = useState(false)

  // Rollover state
  const [rolloverTarget, setRolloverTarget] = useState<SchoolYear | null>(null)
  const [currentClasses, setCurrentClasses] = useState<ClassWithMembers[]>([])
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [studentSelections, setStudentSelections] = useState<Record<string, Set<string>>>({})
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [rollingOver, setRollingOver] = useState(false)
  const [rolloverDone, setRolloverDone] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  // ── Load school years ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }
    loadYears()
  }, [profile])

  async function loadYears() {
    setLoading(true)
    const { data, error } = await supabase
      .from('school_years')
      .select('*')
      .eq('tenant_id', profile!.tenant_id)
      .order('start_date', { ascending: false })
    if (error) { console.error(error); setLoading(false); return }
    const years: SchoolYear[] = data ?? []
    setSchoolYears(years)
    setActiveYear(years.find(y => y.is_active) ?? null)
    setLoading(false)
  }

  // ── Create new school year ─────────────────────────────────────────────────

  async function handleCreateYear() {
    if (!newYearForm.name || !newYearForm.start_date || !newYearForm.end_date) {
      alert('Vul alle velden in.')
      return
    }
    setCreating(true)
    const { error } = await supabase.from('school_years').insert({
      tenant_id: profile!.tenant_id,
      name: newYearForm.name,
      start_date: newYearForm.start_date,
      end_date: newYearForm.end_date,
      is_active: false,
    })
    setCreating(false)
    if (error) { alert('Fout bij aanmaken: ' + error.message); return }
    setShowCreateModal(false)
    setNewYearForm({ name: '', start_date: '', end_date: '' })
    loadYears()
  }

  // ── Activate a school year ────────────────────────────────────────────────

  async function activateYear(year: SchoolYear) {
    setActivating(year.id)
    try {
      // Activate the target year FIRST.
      // Previous order (deactivate all → activate one) left zero active years
      // between the two queries — a failure on step 2 took the whole app offline.
      // New order: if step 2 fails, at worst two years are briefly both active,
      // which is a recoverable state (just call activateYear again).
      const { error } = await supabase.from('school_years').update({ is_active: true }).eq('id', year.id)
      if (error) throw error
      await supabase.from('school_years')
        .update({ is_active: false })
        .eq('tenant_id', profile!.tenant_id)
        .neq('id', year.id)
      await loadYears()
    } catch (e: any) {
      alert('Fout bij activeren: ' + e.message)
    } finally {
      setActivating(null)
    }
  }

  // ── Start rollover: load active year's classes ─────────────────────────────

  async function startRollover(targetYear: SchoolYear) {
    if (!activeYear) return
    setRolloverTarget(targetYear)
    setRolloverDone(false)
    setLoadingClasses(true)
    setCurrentClasses([])
    setStudentSelections({})
    setExpandedClasses(new Set())

    // 1. Fetch classes for active year
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('*, groups(name)')
      .eq('school_year_id', activeYear.id)
      .eq('is_archived', false)
      .order('name')

    if (classError) {
      alert('Fout bij laden van klassen: ' + classError.message)
      setLoadingClasses(false)
      return
    }

    const classRows = classData ?? []
    if (classRows.length === 0) {
      setCurrentClasses([])
      setLoadingClasses(false)
      return
    }

    const classIds = classRows.map((c: any) => c.id)

    // 2. Fetch teacher + student links (IDs only), then profiles separately
    const [{ data: teacherLinks }, { data: studentLinks }] = await Promise.all([
      supabase.from('class_teachers').select('class_id, teacher_id').in('class_id', classIds),
      supabase.from('class_students').select('class_id, student_id').in('class_id', classIds),
    ])

    const teacherIds = Array.from(new Set((teacherLinks ?? []).map((l: any) => l.teacher_id)))
    const studentIds = Array.from(new Set((studentLinks ?? []).map((l: any) => l.student_id)))

    const [{ data: teacherProfiles }, { data: studentProfiles }] = await Promise.all([
      teacherIds.length ? supabase.from('profiles').select('id, first_name, last_name').in('id', teacherIds) : Promise.resolve({ data: [] }),
      studentIds.length ? supabase.from('profiles').select('id, first_name, last_name').in('id', studentIds) : Promise.resolve({ data: [] }),
    ])

    const tpMap = Object.fromEntries((teacherProfiles ?? []).map((p: any) => [p.id, p]))
    const spMap = Object.fromEntries((studentProfiles ?? []).map((p: any) => [p.id, p]))

    const teacherMap: Record<string, { id: string; first_name: string; last_name: string }[]> = {}
    const studentMap: Record<string, { id: string; first_name: string; last_name: string }[]> = {}

    for (const link of (teacherLinks ?? [])) {
      if (!teacherMap[link.class_id]) teacherMap[link.class_id] = []
      const p = tpMap[link.teacher_id]
      if (p) teacherMap[link.class_id].push(p)
    }
    for (const link of (studentLinks ?? [])) {
      if (!studentMap[link.class_id]) studentMap[link.class_id] = []
      const p = spMap[link.student_id]
      if (p) studentMap[link.class_id].push(p)
    }

    // Build enriched class list
    const enriched: ClassWithMembers[] = classRows.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      color: c.color ?? null,
      group_id: c.group_id ?? null,
      school_year_id: c.school_year_id,
      teachers: teacherMap[c.id] ?? [],
      students: studentMap[c.id] ?? [],
      groupName: c.groups?.name ?? null,
    }))

    // Default: all students selected
    const defaultSelections: Record<string, Set<string>> = {}
    for (const c of enriched) {
      defaultSelections[c.id] = new Set(c.students.map(s => s.id))
    }

    setCurrentClasses(enriched)
    setStudentSelections(defaultSelections)
    setLoadingClasses(false)
  }

  // ── Toggle student selection ───────────────────────────────────────────────

  function toggleStudent(classId: string, studentId: string) {
    setStudentSelections(prev => {
      const next = { ...prev }
      const set = new Set(next[classId] ?? [])
      if (set.has(studentId)) set.delete(studentId)
      else set.add(studentId)
      next[classId] = set
      return next
    })
  }

  function toggleAllStudents(classId: string, students: ClassWithMembers['students']) {
    setStudentSelections(prev => {
      const current = prev[classId] ?? new Set()
      const allSelected = students.every(s => current.has(s.id))
      const next = { ...prev }
      next[classId] = allSelected ? new Set() : new Set(students.map(s => s.id))
      return next
    })
  }

  function toggleExpandClass(classId: string) {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  // ── Execute rollover ───────────────────────────────────────────────────────

  async function executeRollover() {
    if (!rolloverTarget || !activeYear) return
    const confirmed = window.confirm(
      `Jaarovergang uitvoeren naar "${rolloverTarget.name}"?\n\n` +
      `Klassen en geselecteerde leerlingen worden gekopieerd naar het nieuwe schooljaar.`
    )
    if (!confirmed) return

    setRollingOver(true)

    try {
      for (const cls of currentClasses) {
        // a. Find or create group in target year
        let newGroupId: string | null = null
        if (cls.groupName) {
          // Try to find existing group with same name in target year
          const { data: existingGroup } = await supabase
            .from('groups')
            .select('id')
            .eq('tenant_id', profile!.tenant_id)
            .eq('school_year_id', rolloverTarget.id)
            .eq('name', cls.groupName)
            .maybeSingle()

          if (existingGroup) {
            newGroupId = existingGroup.id
          } else {
            // Create new group
            const { data: newGroup, error: groupError } = await supabase
              .from('groups')
              .insert({
                tenant_id: profile!.tenant_id,
                school_year_id: rolloverTarget.id,
                name: cls.groupName,
              })
              .select('id')
              .single()
            if (groupError) throw new Error(`Groep aanmaken mislukt: ${groupError.message}`)
            newGroupId = newGroup.id
          }
        }

        // b. Create new class in target year
        const { data: newClass, error: classError } = await supabase
          .from('classes')
          .insert({
            tenant_id: profile!.tenant_id,
            school_year_id: rolloverTarget.id,
            group_id: newGroupId,
            name: cls.name,
            description: cls.description,
            color: cls.color,
            is_archived: false,
          })
          .select('id')
          .single()
        if (classError) throw new Error(`Klas aanmaken mislukt: ${classError.message}`)

        const newClassId = newClass.id

        // c. Copy teachers
        if (cls.teachers.length > 0) {
          const { error: teacherError } = await supabase
            .from('class_teachers')
            .insert(cls.teachers.map(t => ({ class_id: newClassId, teacher_id: t.id })))
          if (teacherError) throw new Error(`Leerkrachten kopiëren mislukt: ${teacherError.message}`)
        }

        // d. Insert selected students
        const selectedStudentIds = Array.from(studentSelections[cls.id] ?? [])
        if (selectedStudentIds.length > 0) {
          const { error: studentError } = await supabase
            .from('class_students')
            .insert(selectedStudentIds.map(sid => ({ class_id: newClassId, student_id: sid })))
          if (studentError) throw new Error(`Leerlingen kopiëren mislukt: ${studentError.message}`)
        }
      }

      setRolloverDone(true)
    } catch (err: any) {
      alert('Fout bij jaarovergang: ' + err.message)
    } finally {
      setRollingOver(false)
    }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (profileLoading || loading) return <PageLoader />

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-slide-up max-w-3xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <Link href="/beheer" className="text-sm text-gray-400 hover:text-primary-600 transition-colors inline-flex items-center gap-1 mb-2">
            ← Terug naar beheer
          </Link>
          <h1 className="page-title">Jaarovergang</h1>
          <p className="page-subtitle">Schooljaren beheren en klassen overzetten naar een nieuw schooljaar</p>
        </div>
      </div>

      {/* School years list */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={17} className="text-primary-600"/> Schooljaren
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <Plus size={15}/> Nieuw schooljaar
          </button>
        </div>

        {schoolYears.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nog geen schooljaren aangemaakt.</p>
        ) : (
          <div className="space-y-3">
            {schoolYears.map(year => {
              const today = new Date()
              const start = new Date(year.start_date)
              const end = new Date(year.end_date)
              const isCurrent = today >= start && today <= end
              const isTarget = rolloverTarget?.id === year.id
              return (
                <div
                  key={year.id}
                  className={`rounded-xl border p-4 flex items-center gap-4 transition-colors ${
                    isTarget ? 'border-primary-300 bg-primary-50/50' : 'border-border bg-white'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{year.name}</span>
                      {year.is_active && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">Actief</span>
                      )}
                      {isCurrent && !year.is_active && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Huidige periode</span>
                      )}
                      {isTarget && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Doel overzetting</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(year.start_date)} – {formatDate(year.end_date)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!year.is_active && (
                      <button
                        onClick={() => activateYear(year)}
                        disabled={activating === year.id}
                        className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                      >
                        {activating === year.id ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
                        Activeren
                      </button>
                    )}
                    {!year.is_active && activeYear && (
                      <button
                        onClick={() => startRollover(year)}
                        disabled={loadingClasses}
                        className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                      >
                        {loadingClasses && isTarget ? <Loader2 size={12} className="animate-spin"/> : <ArrowRight size={12}/>}
                        Klassen overzetten
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!activeYear && schoolYears.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            Geen actief schooljaar. Klik op "Activeren" bij het gewenste schooljaar.
          </div>
        )}
      </div>

      {/* Rollover panel */}
      {rolloverTarget && activeYear && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-1">
            <GraduationCap size={18} className="text-primary-600 flex-shrink-0"/>
            <h2 className="font-semibold text-gray-900">
              Klassen overzetten: {activeYear.name} <ArrowRight size={14} className="inline text-gray-400"/> {rolloverTarget.name}
            </h2>
          </div>
          <p className="text-sm text-gray-500 mb-5 ml-7">
            Vink per klas aan welke leerlingen doorgaan naar het nieuwe schooljaar. Leerlingen die niet doorgaan kunt u uitvinken. Leerkrachten worden automatisch overgenomen.
          </p>

          {rolloverDone ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 size={44} className="text-primary-500"/>
              <p className="font-semibold text-gray-900 text-lg">Klassen overgezet!</p>
              <p className="text-sm text-gray-500">
                Alle klassen zijn aangemaakt in <strong>{rolloverTarget.name}</strong> met de geselecteerde leerlingen.
              </p>
              {!rolloverTarget.is_active && (
                <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 max-w-sm">
                  <p className="font-medium mb-2">Wilt u nu overschakelen naar {rolloverTarget.name}?</p>
                  <p className="text-xs text-amber-600 mb-3">Dit maakt het nieuwe schooljaar actief en deactiveert het huidige.</p>
                  <button
                    onClick={() => activateYear(rolloverTarget)}
                    disabled={activating === rolloverTarget.id}
                    className="btn-primary text-sm py-2 px-4 w-full flex items-center justify-center gap-2"
                  >
                    {activating === rolloverTarget.id ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                    {rolloverTarget.name} activeren
                  </button>
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setRolloverTarget(null); setRolloverDone(false) }}
                  className="btn-secondary text-sm py-2 px-4"
                >
                  Sluiten
                </button>
                <Link href="/klassen" className="btn-primary text-sm py-2 px-4">
                  Bekijk klassen
                </Link>
              </div>
            </div>
          ) : loadingClasses ? (
            <div className="flex items-center gap-2 py-10 justify-center text-gray-400">
              <Loader2 size={18} className="animate-spin"/> Klassen laden…
            </div>
          ) : currentClasses.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">
              Geen actieve klassen gevonden in het huidige schooljaar.
            </div>
          ) : (
            <>
              {/* Class list */}
              <div className="space-y-3 mb-6">
                {currentClasses.map(cls => {
                  const isExpanded = expandedClasses.has(cls.id)
                  const selected = studentSelections[cls.id] ?? new Set()
                  const allSelected = cls.students.length > 0 && cls.students.every(s => selected.has(s.id))
                  const noneSelected = cls.students.every(s => !selected.has(s.id))

                  return (
                    <div key={cls.id} className="rounded-xl border border-border overflow-hidden">
                      {/* Class header */}
                      <div
                        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleExpandClass(cls.id)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: cls.color ?? '#1B6B4A' }}
                        >
                          {cls.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-800">{cls.name}</span>
                            {cls.groupName && (
                              <span className="text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">
                                {cls.groupName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            <span className="flex items-center gap-1 mt-0.5">
                              <Users size={11}/>
                              {selected.size}/{cls.students.length} leerlingen geselecteerd
                              {cls.teachers.length > 0 && (
                                <> · {cls.teachers.map(t => `${t.first_name} ${t.last_name}`).join(', ')}</>
                              )}
                            </span>
                          </div>
                        </div>
                        {isExpanded
                          ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0"/>
                          : <ChevronDown size={15} className="text-gray-400 flex-shrink-0"/>
                        }
                      </div>

                      {/* Expanded student list */}
                      {isExpanded && (
                        <div className="border-t border-border bg-gray-50/50 px-4 pb-3 pt-2">
                          {cls.students.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">Geen leerlingen ingeschreven.</p>
                          ) : (
                            <>
                              {/* Toggle all */}
                              <button
                                onClick={() => toggleAllStudents(cls.id, cls.students)}
                                className="text-xs text-primary-600 hover:text-primary-800 font-medium mb-2 transition-colors"
                              >
                                {allSelected ? 'Alle leerlingen deselecteren' : 'Alle leerlingen selecteren'}
                              </button>
                              <div className="space-y-0.5">
                                {cls.students.map(student => {
                                  const isChecked = selected.has(student.id)
                                  return (
                                    <label
                                      key={student.id}
                                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleStudent(cls.id, student.id)}
                                        className="w-3.5 h-3.5 accent-primary-600 flex-shrink-0"
                                      />
                                      <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                                        {student.first_name?.[0]}{student.last_name?.[0]}
                                      </div>
                                      <span className={`text-sm ${isChecked ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                                        {student.first_name} {student.last_name}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Summary + confirm */}
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
                <div className="text-sm text-gray-500">
                  <strong className="text-gray-800">{currentClasses.length}</strong> klassen worden aangemaakt in{' '}
                  <strong className="text-gray-800">{rolloverTarget.name}</strong>.
                  Leerkrachten worden automatisch overgenomen.
                </div>
                <button
                  onClick={executeRollover}
                  disabled={rollingOver}
                  className="btn-primary flex items-center gap-2 flex-shrink-0"
                >
                  {rollingOver
                    ? <><Loader2 size={15} className="animate-spin"/> Bezig…</>
                    : <><CheckCircle2 size={15}/> Jaarovergang uitvoeren</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Create year modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h2 className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2">
              <Plus size={18} className="text-primary-600"/> Nieuw schooljaar aanmaken
            </h2>

            <div className="space-y-4">
              <div>
                <label className="label">Naam</label>
                <input
                  type="text"
                  placeholder="bijv. 2025-2026"
                  value={newYearForm.name}
                  onChange={e => setNewYearForm(prev => ({ ...prev, name: e.target.value }))}
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Startdatum</label>
                  <input
                    type="date"
                    value={newYearForm.start_date}
                    onChange={e => setNewYearForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Einddatum</label>
                  <input
                    type="date"
                    value={newYearForm.end_date}
                    onChange={e => setNewYearForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setNewYearForm({ name: '', start_date: '', end_date: '' }) }}
                className="btn-secondary flex-1"
                disabled={creating}
              >
                Annuleren
              </button>
              <button
                onClick={handleCreateYear}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={creating}
              >
                {creating ? <><Loader2 size={15} className="animate-spin"/> Opslaan…</> : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
