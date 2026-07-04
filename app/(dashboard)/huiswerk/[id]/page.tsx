'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { formatDateTime, getDeadlineLabel } from '@/lib/utils'
import { ArrowLeft, Clock } from 'lucide-react'
import Link from 'next/link'
import SubmitAssignmentForm from '@/components/features/assignments/SubmitAssignmentForm'
import TeacherSubmissionsView from '@/components/features/assignments/TeacherSubmissionsView'

export default function HuiswerkDetailPage() {
  const { id } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const [assignment, setAssignment] = useState<any>(null)
  const [mySubmission, setMySubmission] = useState<any>(null)
  const [allSubmissions, setAllSubmissions] = useState<any[]>([])
  const [studentCount, setStudentCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile || !id) return
    loadData()
  }, [profile, id])

  async function loadData() {
    const supabase = getSupabase()
    const isTeacher = ['teacher','admin','super_admin'].includes(profile!.role)

    const { data: a } = await supabase.from('assignments').select('*, classes(name, color), profiles!assignments_created_by_fkey(first_name, last_name)').eq('id', id).single()
    setAssignment(a)

    if (profile!.role === 'student') {
      const { data: sub } = await supabase
        .from('submissions')
        .select('*, submission_files(*)')
        .eq('assignment_id', id)
        .eq('student_id', profile!.id)
        .maybeSingle()
      if (sub) {
        const { data: fb } = await supabase
          .from('submission_feedback')
          .select('score, comment, teacher_id')
          .eq('submission_id', sub.id)
          .maybeSingle()
        setMySubmission({ ...sub, submission_feedback: fb ? [fb] : [] })
      } else {
        setMySubmission(null)
      }
    }

    if (isTeacher && a) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*, profiles!submissions_student_id_fkey(first_name, last_name), submission_files(*)')
        .eq('assignment_id', id)
      if (subs?.length) {
        const { data: feedbacks } = await supabase
          .from('submission_feedback')
          .select('*')
          .in('submission_id', subs.map((s: any) => s.id))
        const fbMap: Record<string, any> = {}
        feedbacks?.forEach((f: any) => { fbMap[f.submission_id] = f })
        setAllSubmissions(subs.map((s: any) => ({ ...s, submission_feedback: fbMap[s.id] ? [fbMap[s.id]] : [] })))
      } else {
        setAllSubmissions([])
      }
      const { count } = await supabase.from('class_students').select('*', { count: 'estimated', head: true }).eq('class_id', a.class_id)
      setStudentCount(count ?? 0)
    }
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!assignment) return null

  const dl = getDeadlineLabel(assignment.due_date)
  const isTeacher = ['teacher','admin','super_admin'].includes(profile?.role ?? '')

  return (
    <div className="animate-slide-up max-w-3xl">
      <Link href="/huiswerk" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"><ArrowLeft size={15}/> Terug naar huiswerk</Link>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: assignment.classes?.color ?? '#1B6B4A' }}>{assignment.classes?.name}</span>
              {assignment.max_score && <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">Max {assignment.max_score} punten</span>}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{assignment.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5"><Clock size={14} className="text-gray-400"/><span className={dl.color + ' font-medium'}>{dl.label}</span></div>
          <div className="text-gray-400">Door {assignment.profiles?.first_name} {assignment.profiles?.last_name}</div>
          <div className="text-gray-400">{formatDateTime(assignment.created_at)}</div>
        </div>
        {assignment.description && <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border border-border">{assignment.description}</div>}
        <div className="flex gap-2 mt-4">
          {assignment.allow_file_submission && <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">📎 Bestand uploaden</span>}
          {assignment.allow_text_submission && <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg">✏️ Tekst invoeren</span>}
        </div>
      </div>

      {profile?.role === 'student' && (
        <SubmitAssignmentForm assignmentId={id as string} assignment={assignment} existingSubmission={mySubmission} userId={profile.id} />
      )}
      {isTeacher && (
        <TeacherSubmissionsView submissions={allSubmissions} studentCount={studentCount} assignmentId={id as string} maxScore={assignment.max_score} />
      )}
    </div>
  )
}
