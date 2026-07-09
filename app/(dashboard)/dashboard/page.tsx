'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getDeadlineLabel } from '@/lib/utils'
import { BookOpen, FileText, GraduationCap, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { AnnouncementsCard } from '@/components/features/announcements/AnnouncementsCard'
import { AttendanceAlertsCard } from '@/components/features/attendance/AttendanceAlertsCard'

export default function DashboardPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [data, setData] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    loadData()
  }, [profile])

  async function loadData() {
    const supabase = getSupabase()
    const role = profile!.role

    // One round-trip instead of a query waterfall (migration 20). Falls back
    // to the separate queries while the RPC isn't applied in prod yet.
    const { data: d, error } = await supabase.rpc('get_dashboard_data')
    if (!error && d) {
      if (role === 'student') {
        setData({
          enrollments: (d.classes ?? []).map((c: any) => ({ classes: c })),
          assignments: (d.open_assignments ?? []).map((a: any) => ({ ...a, classes: { name: a.class_name } })),
          openCount: d.open_count,
          submittedCount: d.submitted_count,
        })
      } else if (role === 'teacher') {
        setData({
          teachingClasses: (d.classes ?? []).map((c: any) => ({ classes: c })),
          assignmentCount: d.assignment_count,
          submissionCount: d.to_grade_count,
        })
      } else if (role === 'super_admin') {
        setData({ classCount: d.class_count, teacherCount: d.teacher_count, studentCount: d.student_count, tenantCount: d.tenant_count })
      } else {
        setData({ classCount: d.class_count, teacherCount: d.teacher_count, studentCount: d.student_count })
      }
      setLoading(false)
      return
    }

    if (role === 'student') {
      const { data: enrollments } = await supabase.from('class_students').select('classes(id, name, color)').eq('student_id', profile!.id)
      const classIds = enrollments?.map((e: any) => e.classes?.id).filter(Boolean) ?? []
      let assignments: any[] = []
      if (classIds.length > 0) {
        const { data: a } = await supabase.from('assignments').select('*, classes(name)').in('class_id', classIds).eq('is_published', true).order('due_date', { ascending: true })
        assignments = a ?? []
        if (assignments.length > 0) {
          const { data: subs } = await supabase.from('submissions').select('assignment_id').eq('student_id', profile!.id).in('assignment_id', assignments.map((x: any) => x.id))
          const submittedIds = new Set(subs?.map((s: any) => s.assignment_id) ?? [])
          assignments = assignments.filter((a: any) => !submittedIds.has(a.id))
        }
      }
      const { count: submittedCount } = await supabase.from('submissions').select('*', { count: 'estimated', head: true }).eq('student_id', profile!.id)
      setData({ enrollments, assignments: assignments.slice(0, 5), submittedCount })
    } else if (role === 'teacher') {
      const { data: teaching } = await supabase.from('class_teachers').select('classes(id, name, color)').eq('teacher_id', profile!.id)
      const classIds = teaching?.map((c: any) => c.classes?.id).filter(Boolean) ?? []
      const { count: assignmentCount } = await supabase.from('assignments').select('*', { count: 'estimated', head: true }).in('class_id', classIds)
      const { data: assignmentRows } = classIds.length > 0
        ? await supabase.from('assignments').select('id').in('class_id', classIds)
        : { data: [] }
      const assignmentIds = assignmentRows?.map((a: any) => a.id) ?? []
      const { count: submissionCount } = assignmentIds.length > 0
        ? await supabase.from('submissions').select('*', { count: 'estimated', head: true }).in('assignment_id', assignmentIds).eq('status', 'submitted')
        : { count: 0 }
      setData({ teachingClasses: teaching, assignmentCount, submissionCount })
    } else if (role === 'super_admin') {
      const [{ count: classCount }, { count: teacherCount }, { count: studentCount }, { count: tenantCount }] = await Promise.all([
        supabase.from('classes').select('*', { count: 'estimated', head: true }).eq('is_archived', false),
        supabase.from('profiles').select('*', { count: 'estimated', head: true }).eq('role', 'teacher'),
        supabase.from('profiles').select('*', { count: 'estimated', head: true }).eq('role', 'student'),
        supabase.from('tenants').select('*', { count: 'estimated', head: true }).eq('is_active', true),
      ])
      setData({ classCount, teacherCount, studentCount, tenantCount })
    } else {
      const tid = profile!.tenant_id
      const { count: classCount } = await supabase.from('classes').select('*', { count: 'estimated', head: true }).eq('tenant_id', tid).eq('is_archived', false)
      const { count: teacherCount } = await supabase.from('profiles').select('*', { count: 'estimated', head: true }).eq('tenant_id', tid).eq('role', 'teacher')
      const { count: studentCount } = await supabase.from('profiles').select('*', { count: 'estimated', head: true }).eq('tenant_id', tid).eq('role', 'student')
      setData({ classCount, teacherCount, studentCount })
    }
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const role = profile?.role

  if (role === 'student') {
    const { enrollments, assignments, openCount, submittedCount } = data
    return (
      <div className="animate-slide-up">
        <div className="page-header">
          <h1 className="page-title">Salam {profile?.first_name} 👋</h1>
          <p className="page-subtitle">Overzicht van jouw leeractiviteiten</p>
        </div>
        <AnnouncementsCard profile={profile!} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link href="/klassen" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{enrollments?.length ?? 0}</div><div className="text-sm text-gray-500">Klassen</div></div></Link>
          <Link href="/huiswerk" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-amber-50"><Clock className="text-amber-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{openCount ?? assignments?.length ?? 0}</div><div className="text-sm text-gray-500">Openstaand huiswerk</div></div></Link>
          <Link href="/huiswerk" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-blue-50"><CheckCircle2 className="text-blue-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{submittedCount ?? 0}</div><div className="text-sm text-gray-500">Ingediende taken</div></div></Link>
        </div>
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Openstaand huiswerk</h2>
            <Link href="/huiswerk" className="text-sm text-primary-600 hover:text-primary-700 font-medium">Alles zien →</Link>
          </div>
          {!assignments?.length ? (
            <div className="text-center py-8"><CheckCircle2 size={32} className="mx-auto mb-2 text-green-400"/><p className="text-sm text-gray-400">Geen openstaand huiswerk!</p></div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a: any) => { const dl = getDeadlineLabel(a.due_date); return (
                <Link key={a.id} href={`/huiswerk/${a.id}`} className="flex items-center justify-between p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                  <div><div className="font-medium text-gray-800 text-sm group-hover:text-primary-700">{a.title}</div><div className="text-xs text-gray-400">{a.classes?.name}</div></div>
                  <span className={`text-xs font-medium ${dl.color}`}>{dl.label}</span>
                </Link>
              )})}
            </div>
          )}
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Mijn klassen</h2>
            <Link href="/klassen" className="text-sm text-primary-600 hover:text-primary-700 font-medium">Alles zien →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {enrollments?.map((e: any) => (
              <Link key={e.classes?.id} href={`/klassen/${e.classes?.id}`} className="flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: e.classes?.color ?? '#1B6B4A' }}>{e.classes?.name?.[0]}</div>
                <span className="font-medium text-gray-800 text-sm">{e.classes?.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (role === 'teacher') {
    const { teachingClasses, assignmentCount, submissionCount } = data
    return (
      <div className="animate-slide-up">
        <div className="page-header">
          <h1 className="page-title">Salam {profile?.first_name} 👋</h1>
          <p className="page-subtitle">Overzicht van uw klassen</p>
        </div>
        <AnnouncementsCard profile={profile!} />
        <AttendanceAlertsCard profile={profile!} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link href="/klassen" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{teachingClasses?.length ?? 0}</div><div className="text-sm text-gray-500">Mijn klassen</div></div></Link>
          <Link href="/huiswerk" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-blue-50"><FileText className="text-blue-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{assignmentCount ?? 0}</div><div className="text-sm text-gray-500">Opdrachten aangemaakt</div></div></Link>
          <Link href="/huiswerk" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-amber-50"><AlertCircle className="text-amber-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{submissionCount ?? 0}</div><div className="text-sm text-gray-500">Te beoordelen taken</div></div></Link>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Mijn klassen</h2>
            <Link href="/klassen" className="text-sm text-primary-600 font-medium">Alles zien →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teachingClasses?.map((e: any) => (
              <Link key={e.classes?.id} href={`/klassen/${e.classes?.id}`} className="flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: e.classes?.color ?? '#1B6B4A' }}>{e.classes?.name?.[0]}</div>
                <span className="font-medium text-gray-800 text-sm">{e.classes?.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (role === 'leerlingenbegeleiding') {
    const { studentCount, classCount } = data
    return (
      <div className="animate-slide-up">
        <div className="page-header">
          <h1 className="page-title">Salam {profile?.first_name} 👋</h1>
          <p className="page-subtitle">Leerlingenbegeleiding</p>
        </div>
        <AnnouncementsCard profile={profile!} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="stat-card"><div className="stat-icon bg-amber-50"><Users className="text-amber-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{studentCount ?? 0}</div><div className="text-sm text-gray-500">Leerlingen</div></div></div>
          <div className="stat-card"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{classCount ?? 0}</div><div className="text-sm text-gray-500">Klassen</div></div></div>
        </div>
        <Link href="/dossiers" className="card-hover p-6 flex items-center gap-4">
          <div className="stat-icon bg-purple-50"><FileText className="text-purple-600" size={22}/></div>
          <div><div className="font-semibold text-gray-900">Leerlingendossiers</div><div className="text-sm text-gray-500 mt-0.5">Dossiers, notities en documenten van alle leerlingen</div></div>
        </Link>
      </div>
    )
  }

  if (role === 'super_admin') {
    const { classCount, teacherCount, studentCount, tenantCount } = data
    return (
      <div className="animate-slide-up">
        <div className="page-header">
          <h1 className="page-title">Salam {profile?.first_name} 👋</h1>
          <p className="page-subtitle">Platform overzicht</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Link href="/superadmin" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-purple-50"><Users className="text-purple-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{tenantCount ?? 0}</div><div className="text-sm text-gray-500">Moskeeën</div></div></Link>
          <Link href="/klassen" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{classCount ?? 0}</div><div className="text-sm text-gray-500">Klassen</div></div></Link>
          <div className="stat-card"><div className="stat-icon bg-blue-50"><BookOpen className="text-blue-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{teacherCount ?? 0}</div><div className="text-sm text-gray-500">Leerkrachten</div></div></div>
          <div className="stat-card"><div className="stat-icon bg-amber-50"><Users className="text-amber-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{studentCount ?? 0}</div><div className="text-sm text-gray-500">Leerlingen</div></div></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/superadmin" className="card-hover p-6 flex items-center gap-4"><div className="stat-icon bg-purple-50"><Users className="text-purple-600" size={22}/></div><div><div className="font-semibold text-gray-900">Moskeeën beheren</div><div className="text-sm text-gray-500 mt-0.5">Tenants, gebruikers en abonnementen</div></div></Link>
          <Link href="/klassen" className="card-hover p-6 flex items-center gap-4"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="font-semibold text-gray-900">Alle klassen</div><div className="text-sm text-gray-500 mt-0.5">Klassen over alle moskeeën</div></div></Link>
        </div>
      </div>
    )
  }

  const { classCount, teacherCount, studentCount } = data
  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Salam {profile?.first_name} 👋</h1>
        <p className="page-subtitle">Overzicht van uw school</p>
      </div>
      <AnnouncementsCard profile={profile!} />
      <AttendanceAlertsCard profile={profile!} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/klassen" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{classCount ?? 0}</div><div className="text-sm text-gray-500">Actieve klassen</div></div></Link>
        <Link href="/beheer" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-blue-50"><BookOpen className="text-blue-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{teacherCount ?? 0}</div><div className="text-sm text-gray-500">Leerkrachten</div></div></Link>
        <Link href="/beheer" className="stat-card hover:border-primary-200 transition-colors"><div className="stat-icon bg-amber-50"><Users className="text-amber-600" size={22}/></div><div><div className="text-2xl font-semibold text-gray-900">{studentCount ?? 0}</div><div className="text-sm text-gray-500">Leerlingen</div></div></Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/klassen" className="card-hover p-6 flex items-center gap-4"><div className="stat-icon bg-primary-50"><GraduationCap className="text-primary-600" size={22}/></div><div><div className="font-semibold text-gray-900">Klassen beheren</div><div className="text-sm text-gray-500 mt-0.5">Klassen, leerlingen en leerkrachten</div></div></Link>
        <Link href="/beheer" className="card-hover p-6 flex items-center gap-4"><div className="stat-icon bg-blue-50"><Users className="text-blue-600" size={22}/></div><div><div className="font-semibold text-gray-900">Gebruikers beheren</div><div className="text-sm text-gray-500 mt-0.5">Accounts en uitnodigingen</div></div></Link>
      </div>
    </div>
  )
}
