'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, LoadError } from '@/components/ui/PageShell'
import { formatDateTime, getDeadlineLabel } from '@/lib/utils'
import { ArrowLeft, Clock } from 'lucide-react'
import Link from 'next/link'
import SubmitAssignmentForm from '@/components/features/assignments/SubmitAssignmentForm'
import TeacherSubmissionsView from '@/components/features/assignments/TeacherSubmissionsView'

export default function HuiswerkDetailPage() {
  const { id } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const [assignment, setAssignment] = useState<any>(null)
  // The pupil's own task when the teacher set homework per pupil (migration 31).
  // RLS returns only this pupil's row, so a classmate's task never arrives here.
  const [myTask, setMyTask] = useState<string | null>(null)
  const [perStudentRows, setPerStudentRows] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [mySubmission, setMySubmission] = useState<any>(null)
  const [allSubmissions, setAllSubmissions] = useState<any[]>([])
  const [studentCount, setStudentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<unknown>(null)

  useEffect(() => {
    if (!profile || !id) return
    loadData()
  }, [profile, id])

  // `quiet` refreshes the data WITHOUT flipping `loading`. Marking a pupil used
  // to re-run this loader, which swapped the page for the full-page spinner and
  // unmounted the grading view -- so the row collapsed, the "Opgeslagen!"
  // confirmation never appeared, and a teacher working down a class of twenty
  // lost their place after every single pupil.
  async function loadData(quiet = false) {
    const supabase = getSupabase()
    const isTeacher = ['teacher','admin','super_admin'].includes(profile!.role)
    if (!quiet) setLoading(true)
    setLoadErr(null)

    const { data: a, error: aErr } = await supabase.from('assignments').select('*, classes(name, color), profiles!assignments_created_by_fkey(first_name, last_name)').eq('id', id).single()
    if (aErr) { console.error(aErr); setLoadErr(aErr); setLoading(false); return }
    setAssignment(a)

    // Separate query, not a nested join: a join across RLS-protected tables
    // silently returns nothing here.
    let staffPerRows: any[] = []
    if (profile!.role === 'student') {
      const { data: mine } = await supabase
        .from('assignment_students')
        .select('task_text')
        .eq('assignment_id', id)
        .eq('student_id', profile!.id)
        .maybeSingle()
      setMyTask(mine?.task_text ?? null)
    } else {
      const { data: rows } = await supabase
        .from('assignment_students')
        .select('student_id, task_text')
        .eq('assignment_id', id)
      staffPerRows = rows ?? []
      setPerStudentRows(staffPerRows)
    }

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
      let withFb: any[] = []
      if (subs?.length) {
        const { data: feedbacks } = await supabase
          .from('submission_feedback')
          .select('*')
          .in('submission_id', subs.map((s: any) => s.id))
        const fbMap: Record<string, any> = {}
        feedbacks?.forEach((f: any) => { fbMap[f.submission_id] = f })
        withFb = subs.map((s: any) => ({ ...s, submission_feedback: fbMap[s.id] ? [fbMap[s.id]] : [] }))
      }
      setAllSubmissions(withFb)

      // The teacher grades the CLASS, not the inbox. Building the list from the
      // roster instead of from the submissions is what makes it possible to
      // mark a pupil who hands in nothing -- reciting a surah out loud leaves no
      // upload -- and it is the only place the per-pupil task can be shown next
      // to the pupil it belongs to.
      const assignedIds = staffPerRows.map((r: any) => r.student_id)
      let rosterIds = assignedIds
      if (rosterIds.length === 0) {
        const { data: cs } = await supabase
          .from('class_students').select('student_id').eq('class_id', a.class_id)
        rosterIds = (cs ?? []).map((r: any) => r.student_id)
      }
      const { data: profs } = rosterIds.length
        ? await supabase.from('profiles').select('id, first_name, last_name').in('id', rosterIds)
        : { data: [] as any[] }
      const taskOf = Object.fromEntries(staffPerRows.map((r: any) => [r.student_id, r.task_text]))
      const subOf  = Object.fromEntries(withFb.map((s: any) => [s.student_id, s]))
      const coll = new Intl.Collator('nl', { sensitivity: 'base' })
      setRoster((profs ?? [])
        .map((p: any) => ({
          student_id: p.id,
          first_name: p.first_name,
          last_name:  p.last_name,
          task_text:  taskOf[p.id] ?? null,
          submission: subOf[p.id] ?? null,
        }))
        .sort((x: any, y: any) => coll.compare(x.last_name, y.last_name) || coll.compare(x.first_name, y.first_name)))
      setStudentCount(rosterIds.length)
    }
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (loadErr) return (
    <div className="animate-slide-up max-w-3xl">
      <Link href="/huiswerk" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"><ArrowLeft size={15}/> Terug naar huiswerk</Link>
      <LoadError error={loadErr} onRetry={loadData} retrying={loading} />
    </div>
  )
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

        {/* The pupil's own task, shown above the shared description because it is
            the part that is actually theirs. */}
        {myTask && (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Jouw opdracht</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{myTask}</p>
          </div>
        )}

        {/* Staff: make it obvious this is not a whole-class assignment. */}
        {profile?.role !== 'student' && perStudentRows.length > 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            Dit huiswerk is per leerling toegewezen — {perStudentRows.length}{' '}
            {perStudentRows.length === 1 ? 'leerling' : 'leerlingen'} zien het. De rest van de klas niet.
          </p>
        )}
        <div className="flex gap-2 mt-4">
          {assignment.allow_file_submission && <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">📎 Bestand uploaden</span>}
          {assignment.allow_text_submission && <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg">✏️ Tekst invoeren</span>}
        </div>
      </div>

      {profile?.role === 'student' && (
        <SubmitAssignmentForm assignmentId={id as string} assignment={assignment} existingSubmission={mySubmission} userId={profile.id} />
      )}
      {isTeacher && (
        <TeacherSubmissionsView roster={roster} studentCount={studentCount} assignmentId={id as string} maxScore={assignment.max_score} onGraded={() => loadData(true)} />
      )}
    </div>
  )
}
