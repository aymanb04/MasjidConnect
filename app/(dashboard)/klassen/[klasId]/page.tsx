'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getDeadlineLabel, getSubmissionStatusBadge } from '@/lib/utils'
import { ArrowLeft, FileText, BookOpen, Users, Plus, Clock, GraduationCap, Mail, BarChart2, X, Loader2, ScrollText } from 'lucide-react'
import Link from 'next/link'

export default function KlasDetailPage() {
  const { klasId } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const [klas, setKlas] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [mySubmissions, setMySubmissions] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [allTeachers, setAllTeachers] = useState<any[]>([])
  const [addingTeacher, setAddingTeacher] = useState(false)
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [myExamScores, setMyExamScores] = useState<any[]>([])

  useEffect(() => {
    if (!profile || !klasId) return
    loadData()
  }, [profile, klasId])

  async function loadData() {
    const supabase = getSupabase()
    const isTeacher = ['teacher','admin','super_admin'].includes(profile!.role)

    const [{ data: k }, { data: a }, { data: m }, { data: tc }] = await Promise.all([
      supabase.from('classes').select('*, school_years(name), groups(name)').eq('id', klasId).single(),
      supabase.from('assignments').select('*').eq('class_id', klasId).eq('is_published', true).order('due_date', { ascending: true }),
      supabase.from('lesson_modules').select('*, module_documents(id)').eq('class_id', klasId).eq('is_visible', true).order('order_index'),
      supabase.from('class_teachers').select('profiles(id, first_name, last_name, email)').eq('class_id', klasId),
    ])

    setKlas(k)
    setAssignments(a ?? [])
    setModules(m ?? [])
    setTeachers(tc?.map((x: any) => x.profiles).filter(Boolean) ?? [])

    if (isTeacher) {
      const { data: s } = await supabase.from('class_students').select('profiles(id, first_name, last_name)').eq('class_id', klasId)
      setStudents(s?.map((x: any) => x.profiles).filter(Boolean) ?? [])
    }

    if (profile!.role === 'admin') {
      const { data: at } = await supabase.from('profiles').select('id, first_name, last_name').eq('tenant_id', profile!.tenant_id).eq('role', 'teacher').eq('is_active', true).order('last_name')
      setAllTeachers(at ?? [])
    }

    if (profile!.role === 'student') {
      const [{ data: subs }, { data: exams }] = await Promise.all([
        a?.length
          ? supabase.from('submissions').select('*').eq('student_id', profile!.id).in('assignment_id', a.map((x: any) => x.id))
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('exam_scores').select('*').eq('class_id', klasId as string).eq('student_id', profile!.id),
      ])
      const map: Record<string, any> = {}
      subs?.forEach((s: any) => { map[s.assignment_id] = s })
      setMySubmissions(map)
      setMyExamScores(exams ?? [])
    }

    setLoading(false)
  }

  async function assignTeacher() {
    if (!selectedTeacherId) return
    setSavingTeacher(true)
    await getSupabase().from('class_teachers').insert({ class_id: klasId as string, teacher_id: selectedTeacherId })
    setSavingTeacher(false)
    setAddingTeacher(false)
    setSelectedTeacherId('')
    loadData()
  }

  async function removeTeacher(teacherId: string) {
    await getSupabase().from('class_teachers').delete().eq('class_id', klasId as string).eq('teacher_id', teacherId)
    setTeachers(prev => prev.filter(t => t.id !== teacherId))
  }

  if (profileLoading || loading) return <PageLoader />
  if (!klas) return null

  const isTeacher = ['teacher','admin','super_admin'].includes(profile?.role ?? '')
  const isAdmin = profile?.role === 'admin'
  const unassignedTeachers = allTeachers.filter(t => !teachers.some(t2 => t2.id === t.id))

  return (
    <div className="animate-slide-up">
      <div className="mb-6">
        <Link href="/klassen" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={15} /> Terug naar klassen
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl" style={{ backgroundColor: klas.color }}>
            {klas.name[0]}
          </div>
          <div className="flex-1">
            <h1 className="page-title">{klas.name}</h1>
            <p className="page-subtitle">
              {[klas.groups?.name, klas.school_years?.name, klas.description].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link href={`/klassen/${klasId}/rapporten`} className="btn-secondary text-xs py-1.5 px-3">
              <ScrollText size={13}/> Rapporten
            </Link>
            {isTeacher && (
              <Link href={`/klassen/${klasId}/scores`} className="btn-secondary text-xs py-1.5 px-3">
                <BarChart2 size={13}/> Puntenlijst
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><FileText size={18} className="text-primary-600"/><h2 className="font-semibold text-gray-900">Huiswerk</h2></div>
              {isTeacher && <Link href={`/huiswerk?klas=${klasId}`} className="btn-secondary text-xs py-1.5 px-3"><Plus size={13}/> Nieuw</Link>}
            </div>
            {assignments.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">Geen huiswerk voor deze klas.</p> : (
              <div className="space-y-2">
                {assignments.map((a: any) => {
                  const dl = getDeadlineLabel(a.due_date)
                  const sub = mySubmissions[a.id]
                  const sb = sub ? getSubmissionStatusBadge(sub.status) : null
                  return (
                    <Link key={a.id} href={`/huiswerk/${a.id}`} className="flex items-center justify-between p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                      <div className="min-w-0 flex-1"><div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 truncate">{a.title}</div><div className={`text-xs mt-0.5 ${dl.color}`}><Clock size={10} className="inline mr-1"/>{dl.label}</div></div>
                      {sb && <span className={`badge ml-3 flex-shrink-0 ${sb.color}`}>{sb.label}</span>}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><BookOpen size={18} className="text-primary-600"/><h2 className="font-semibold text-gray-900">Lesmodules</h2></div>
              {isTeacher && <Link href={`/lesmodules?klas=${klasId}`} className="btn-secondary text-xs py-1.5 px-3"><Plus size={13}/> Nieuw</Link>}
            </div>
            {modules.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">Geen lesmodules beschikbaar.</p> : (
              <div className="space-y-2">
                {modules.map((m: any) => (
                  <Link key={m.id} href={`/lesmodules/${m.id}`} className="flex items-center justify-between p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                    <div><div className="font-medium text-sm text-gray-800 group-hover:text-primary-700">{m.title}</div>{m.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{m.description}</div>}</div>
                    <span className="text-xs text-gray-400 ml-3 flex-shrink-0">{m.module_documents?.length ?? 0} docs</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Teachers */}
          <div className="card p-6 h-fit">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={18} className="text-primary-600" />
              <h2 className="font-semibold text-gray-900 flex-1">Leerkrachten</h2>
              {isAdmin && !addingTeacher && unassignedTeachers.length > 0 && (
                <button onClick={() => setAddingTeacher(true)} className="text-gray-400 hover:text-primary-600 transition-colors p-0.5" title="Leerkracht toevoegen">
                  <Plus size={16}/>
                </button>
              )}
            </div>
            {teachers.length === 0 && !addingTeacher ? (
              <p className="text-sm text-gray-400 text-center py-2">Geen leerkracht toegewezen.</p>
            ) : (
              <div className="space-y-1">
                {teachers.map((t: any) => {
                  const subject = encodeURIComponent(`Vraag over ${klas.name}`)
                  const body = encodeURIComponent(`Beste ${t.first_name},\n\n`)
                  const mailtoHref = t.email ? `mailto:${t.email}?subject=${subject}&body=${body}` : undefined
                  const isStudent = profile?.role === 'student'
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                      <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {t.first_name?.[0]}{t.last_name?.[0]}
                      </div>
                      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{t.first_name} {t.last_name}</span>
                      {mailtoHref && (
                        <a
                          href={mailtoHref}
                          className={`transition-colors p-0.5 ${isStudent ? 'text-primary-500 hover:text-primary-700' : 'text-gray-300 hover:text-primary-600 opacity-0 group-hover:opacity-100'}`}
                          title={`Mail ${t.first_name}`}
                        >
                          <Mail size={14}/>
                        </a>
                      )}
                      {isAdmin && (
                        <button onClick={() => removeTeacher(t.id)} className="text-gray-200 hover:text-red-400 transition-colors p-0.5 opacity-0 group-hover:opacity-100" title="Verwijderen">
                          <X size={13}/>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {isAdmin && addingTeacher && (
              <div className="mt-3 flex gap-2">
                <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="input flex-1 text-xs py-1.5">
                  <option value="">Kies leerkracht…</option>
                  {unassignedTeachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                </select>
                <button onClick={assignTeacher} disabled={!selectedTeacherId || savingTeacher} className="btn-primary text-xs py-1.5 px-3">
                  {savingTeacher ? <Loader2 size={13} className="animate-spin"/> : 'OK'}
                </button>
                <button onClick={() => { setAddingTeacher(false); setSelectedTeacherId('') }} className="btn-secondary text-xs py-1.5 px-3">
                  <X size={13}/>
                </button>
              </div>
            )}
          </div>

          {/* Exam scores — student sees their own */}
          {profile?.role === 'student' && myExamScores.length > 0 && (
            <div className="card p-6 h-fit">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap size={18} className="text-amber-500"/>
                <h2 className="font-semibold text-gray-900">Examenresultaten</h2>
              </div>
              <div className="space-y-2">
                {([1, 2] as const).map(sem => {
                  const exam = myExamScores.find((e: any) => e.semester === sem)
                  if (!exam) return null
                  const pct = exam.score / exam.max_score
                  const color = pct >= 0.7
                    ? 'bg-green-100 text-green-700'
                    : pct >= 0.5
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                  return (
                    <div key={sem} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border">
                      <span className="text-sm text-gray-700">Examen Semester {sem}</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-sm font-semibold ${color}`}>
                        {exam.score}/{exam.max_score}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Students (teachers/admins only) */}
          {isTeacher && (
            <div className="card p-6 h-fit">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-primary-600" />
                <h2 className="font-semibold text-gray-900">Leerlingen</h2>
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{students.length}</span>
              </div>
              {students.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Geen leerlingen toegewezen.</p> : (
                <div className="space-y-1">
                  {students.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {s.first_name[0]}{s.last_name[0]}
                      </div>
                      <span className="text-sm text-gray-700">{s.first_name} {s.last_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
