'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, EmptyState } from '@/components/ui/PageShell'
import { getDeadlineLabel, getSubmissionStatusBadge } from '@/lib/utils'
import { FileText, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import CreateAssignmentButton from '@/components/features/assignments/CreateAssignmentButton'

export default function HuiswerkPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [assignments, setAssignments] = useState<any[]>([])
  const [mySubmissions, setMySubmissions] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

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
      if (ids.length > 0) {
        const { data: a } = await supabase.from('assignments').select('*, classes(name, color, groups(name), school_years(name))').in('class_id', ids).eq('is_published', true).order('due_date', { ascending: true })
        data = a ?? []
        if (data.length > 0) {
          const { data: subs } = await supabase.from('submissions').select('*').eq('student_id', profile!.id).in('assignment_id', data.map((a: any) => a.id))
          const map: Record<string, any> = {}
          subs?.forEach((s: any) => { map[s.assignment_id] = s })
          setMySubmissions(map)
        }
      }
    } else if (profile!.role === 'teacher') {
      const { data: t } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile!.id)
      const ids = t?.map((x: any) => x.class_id) ?? []
      if (ids.length > 0) {
        const { data: a } = await supabase.from('assignments').select('*, classes(name, color, groups(name), school_years(name))').in('class_id', ids).order('created_at', { ascending: false })
        data = a ?? []
      }
    } else {
      const { data: a } = await supabase.from('assignments').select('*, classes(name, color, groups(name), school_years(name))').order('created_at', { ascending: false })
      data = a ?? []
    }

    setAssignments(data)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const isTeacher = ['teacher','admin','super_admin'].includes(profile?.role ?? '')

  const byClass: Record<string, { name: string; color: string; group: string | null; year: string | null; items: any[] }> = {}
  assignments.forEach(a => {
    if (!byClass[a.class_id]) byClass[a.class_id] = {
      name: a.classes?.name ?? '—',
      color: a.classes?.color ?? '#1B6B4A',
      group: a.classes?.groups?.name ?? null,
      year: a.classes?.school_years?.name ?? null,
      items: [],
    }
    byClass[a.class_id].items.push(a)
  })

  return (
    <div className="animate-slide-up">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Huiswerk</h1>
          <p className="page-subtitle">{isTeacher ? `${assignments.length} opdrachten` : `${assignments.filter(a => !mySubmissions[a.id]).length} openstaand`}</p>
        </div>
        {isTeacher && <CreateAssignmentButton />}
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={<FileText size={40}/>} title="Geen huiswerk gevonden"/>
      ) : (
        <div className="space-y-6">
          {Object.entries(byClass).map(([classId, group]) => (
            <div key={classId} className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-2.5" style={{ borderLeftWidth: '3px', borderLeftColor: group.color }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: group.color }}>{group.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm">{group.name}</div>
                  {(group.group || group.year) && (
                    <div className="text-xs text-gray-400 leading-tight">
                      {[group.group, group.year].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{group.items.length} opdracht{group.items.length !== 1 ? 'en' : ''}</span>
              </div>
              <div className="divide-y divide-border">
                {group.items.map((a: any) => {
                  const dl = getDeadlineLabel(a.due_date)
                  const sub = mySubmissions[a.id]
                  const sb = sub ? getSubmissionStatusBadge(sub.status) : null
                  return (
                    <Link key={a.id} href={`/huiswerk/${a.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors group">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sub ? 'bg-green-100' : 'bg-amber-50'}`}>
                        {sub ? <CheckCircle2 size={16} className="text-green-500"/> : <Clock size={16} className="text-amber-500"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 transition-colors truncate">{a.title}</div>
                        <span className={`text-xs ${dl.color}`}>{dl.label}</span>
                      </div>
                      {sb && <span className={`badge flex-shrink-0 ${sb.color}`}>{sb.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
