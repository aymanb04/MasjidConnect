'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { ArrowLeft, GraduationCap, Plus, X, Check, Pencil, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function ScoresPage() {
  const { klasId } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const [klas, setKlas]               = useState<any>(null)
  const [students, setStudents]       = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [scoreMap, setScoreMap]       = useState<Record<string, Record<string, { status: string; score: number | null }>>>({})
  const [examScores, setExamScores]   = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  // Inline edit state for exam card
  const [editingCell, setEditingCell] = useState<{ studentId: string; semester: 1 | 2 } | null>(null)
  const [editScore, setEditScore]     = useState('')
  const [editMaxScore, setEditMaxScore] = useState('20')
  const [savingCell, setSavingCell]   = useState(false)
  const scoreInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile || !klasId) return
    if (!['teacher', 'admin', 'super_admin'].includes(profile.role)) {
      router.push('/klassen')
      return
    }
    loadData()
  }, [profile, klasId])

  // Focus score input when edit cell opens
  useEffect(() => {
    if (editingCell) scoreInputRef.current?.focus()
  }, [editingCell])

  async function loadData() {
    const supabase = getSupabase()

    const [{ data: k }, { data: studentRows }, { data: a }, { data: exams }] = await Promise.all([
      supabase.from('classes').select('id, name, color').eq('id', klasId).single(),
      supabase.from('class_students')
        .select('profiles!class_students_student_id_fkey(id, first_name, last_name)')
        .eq('class_id', klasId),
      supabase.from('assignments')
        .select('id, title, max_score')
        .eq('class_id', klasId)
        .eq('is_published', true)
        .order('due_date', { ascending: true }),
      supabase.from('exam_scores')
        .select('*')
        .eq('class_id', klasId),
    ])

    const studentList = studentRows?.map((r: any) => r.profiles).filter(Boolean) ?? []
    studentList.sort((a: any, b: any) => a.last_name.localeCompare(b.last_name))
    const assignmentList = a ?? []

    setKlas(k)
    setStudents(studentList)
    setAssignments(assignmentList)
    setExamScores(exams ?? [])

    if (studentList.length && assignmentList.length) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('id, student_id, assignment_id, status')
        .in('assignment_id', assignmentList.map((x: any) => x.id))

      const subIds = subs?.map((s: any) => s.id) ?? []
      const { data: feedbacks } = subIds.length
        ? await supabase.from('submission_feedback').select('submission_id, score').in('submission_id', subIds)
        : { data: [] as any[] }

      const fbMap: Record<string, number | null> = {}
      feedbacks?.forEach((f: any) => { fbMap[f.submission_id] = f.score ?? null })

      const map: Record<string, Record<string, { status: string; score: number | null }>> = {}
      subs?.forEach((s: any) => {
        if (!map[s.student_id]) map[s.student_id] = {}
        map[s.student_id][s.assignment_id] = {
          status: s.status,
          score:  fbMap[s.id] ?? null,
        }
      })
      setScoreMap(map)
    }

    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!klas) return null

  // ── helpers ──────────────────────────────────────────────────────────

  function studentAvg(studentId: string): number | null {
    let earned = 0, total = 0
    for (const a of assignments) {
      const score = scoreMap[studentId]?.[a.id]?.score
      if (score === null || score === undefined || !a.max_score) continue
      earned += score
      total  += a.max_score
    }
    if (!total) return null
    return (earned / total) * 100
  }

  function assignmentAvg(assignmentId: string) {
    const scores = students
      .map((s: any) => scoreMap[s.id]?.[assignmentId]?.score)
      .filter((s): s is number => s !== null && s !== undefined)
    if (!scores.length) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  function fmt(n: number | null, max?: number | null) {
    if (n === null) return null
    return max ? `${Math.round(n * 10) / 10}/${max}` : `${Math.round(n * 10) / 10}`
  }

  function scoreColor(score: number | null, max: number | null) {
    if (score === null || !max) return ''
    const pct = score / max
    if (pct >= 0.7) return 'bg-green-100 text-green-700'
    if (pct >= 0.5) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  function getExam(studentId: string, semester: 1 | 2) {
    return examScores.find(e => e.student_id === studentId && e.semester === semester) ?? null
  }

  function openEdit(studentId: string, semester: 1 | 2, existing?: any) {
    setEditingCell({ studentId, semester })
    setEditScore(existing ? String(existing.score) : '')
    setEditMaxScore(existing ? String(existing.max_score) : '20')
  }

  async function saveExamScore(studentId: string, semester: 1 | 2) {
    const score    = parseFloat(editScore)
    const maxScore = parseFloat(editMaxScore)
    if (isNaN(score) || isNaN(maxScore) || maxScore <= 0 || score < 0) return
    setSavingCell(true)
    const { data, error } = await getSupabase()
      .from('exam_scores')
      .upsert(
        { class_id: klasId as string, student_id: studentId, semester, score, max_score: maxScore },
        { onConflict: 'class_id,student_id,semester' }
      )
      .select()
      .single()
    if (!error && data) {
      setExamScores(prev => [
        ...prev.filter(e => !(e.student_id === studentId && e.semester === semester)),
        data,
      ])
    }
    setSavingCell(false)
    setEditingCell(null)
  }

  async function deleteExamScore(studentId: string, semester: 1 | 2) {
    await getSupabase()
      .from('exam_scores')
      .delete()
      .eq('class_id', klasId as string)
      .eq('student_id', studentId)
      .eq('semester', semester)
    setExamScores(prev => prev.filter(e => !(e.student_id === studentId && e.semester === semester)))
  }

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div className="animate-slide-up">
      <div className="mb-6">
        <Link href={`/klassen/${klasId}`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={15}/> Terug naar klas
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl"
            style={{ backgroundColor: klas.color }}>
            {klas.name[0]}
          </div>
          <div>
            <h1 className="page-title">{klas.name} — Puntenlijst</h1>
            <p className="page-subtitle">{students.length} leerlingen · {assignments.length} opdrachten</p>
          </div>
        </div>
      </div>

      {/* ── Homework grades grid ─────────────────────────────────────── */}
      {assignments.length === 0 || students.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          {assignments.length === 0 ? 'Nog geen opdrachten voor deze klas.' : 'Nog geen leerlingen ingeschreven.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/60">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px] sticky left-0 bg-gray-50/60 z-10">
                    Leerling
                  </th>
                  {assignments.map((a: any) => (
                    <th key={a.id} className="px-3 py-3 font-medium text-gray-600 text-center min-w-[120px]">
                      <Link href={`/huiswerk/${a.id}`}
                        className="hover:text-primary-600 transition-colors line-clamp-2 block text-xs leading-snug">
                        {a.title}
                      </Link>
                      {a.max_score && (
                        <span className="text-xs font-normal text-gray-400">/{a.max_score}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-gray-600 text-center min-w-[80px] border-l border-border">
                    Gem.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s: any) => {
                  const avg = studentAvg(s.id)
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50/50 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {s.first_name[0]}{s.last_name[0]}
                          </div>
                          <span className="font-medium text-gray-800 truncate">{s.first_name} {s.last_name}</span>
                        </div>
                      </td>
                      {assignments.map((a: any) => {
                        const entry = scoreMap[s.id]?.[a.id]
                        if (!entry) {
                          return (
                            <td key={a.id} className="px-3 py-3 text-center">
                              <span className="text-gray-300 text-xs">—</span>
                            </td>
                          )
                        }
                        if (entry.score !== null) {
                          return (
                            <td key={a.id} className="px-3 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${scoreColor(entry.score, a.max_score)}`}>
                                {fmt(entry.score, a.max_score)}
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td key={a.id} className="px-3 py-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs bg-blue-50 text-blue-500">
                              Ingediend
                            </span>
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-center border-l border-border">
                        {avg !== null ? (
                          <span className="text-xs font-semibold text-gray-700">
                            {Math.round(avg * 10) / 10}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-gray-50/60">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-500 sticky left-0 bg-gray-50/60 z-10">
                    Klasgemiddelde
                  </td>
                  {assignments.map((a: any) => {
                    const avg = assignmentAvg(a.id)
                    return (
                      <td key={a.id} className="px-3 py-3 text-center">
                        {avg !== null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-semibold ${scoreColor(avg, a.max_score)}`}>
                            {fmt(avg, a.max_score)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 border-l border-border"/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Examenresultaten card ────────────────────────────────────── */}
      {students.length > 0 && (
        <div className="card overflow-hidden mt-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-amber-50/60">
            <GraduationCap size={16} className="text-amber-600"/>
            <h2 className="font-semibold text-sm text-gray-800">Examenresultaten</h2>
            <span className="text-xs text-gray-400 ml-1">Klik op <Plus size={11} className="inline"/> om een score in te voeren</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/40">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Leerling</th>
                  <th className="px-6 py-3 font-medium text-gray-600 text-center min-w-[160px]">Examen S1</th>
                  <th className="px-6 py-3 font-medium text-gray-600 text-center min-w-[160px]">Examen S2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {s.first_name[0]}{s.last_name[0]}
                        </div>
                        <span className="font-medium text-gray-800">{s.first_name} {s.last_name}</span>
                      </div>
                    </td>

                    {([1, 2] as const).map(sem => {
                      const exam      = getExam(s.id, sem)
                      const isEditing = editingCell?.studentId === s.id && editingCell?.semester === sem

                      return (
                        <td key={sem} className="px-4 py-2 text-center">
                          {isEditing ? (
                            /* ── inline edit ── */
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                ref={scoreInputRef}
                                type="number"
                                value={editScore}
                                onChange={e => setEditScore(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveExamScore(s.id, sem); if (e.key === 'Escape') setEditingCell(null) }}
                                className="input w-16 text-center text-xs py-1"
                                placeholder="Score"
                                min="0"
                              />
                              <span className="text-gray-400 text-xs">/</span>
                              <input
                                type="number"
                                value={editMaxScore}
                                onChange={e => setEditMaxScore(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveExamScore(s.id, sem); if (e.key === 'Escape') setEditingCell(null) }}
                                className="input w-16 text-center text-xs py-1"
                                placeholder="Max"
                                min="1"
                              />
                              <button
                                onClick={() => saveExamScore(s.id, sem)}
                                disabled={savingCell}
                                className="text-green-600 hover:text-green-700 p-0.5 transition-colors"
                                title="Opslaan (Enter)"
                              >
                                {savingCell
                                  ? <Loader2 size={13} className="animate-spin"/>
                                  : <Check size={13}/>}
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
                                className="text-gray-400 hover:text-gray-600 p-0.5 transition-colors"
                                title="Annuleren (Esc)"
                              >
                                <X size={13}/>
                              </button>
                            </div>
                          ) : exam ? (
                            /* ── existing score ── */
                            <div className="flex items-center gap-1 justify-center group">
                              <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-semibold ${scoreColor(exam.score, exam.max_score)}`}>
                                {exam.score}/{exam.max_score}
                              </span>
                              <button
                                onClick={() => openEdit(s.id, sem, exam)}
                                className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                title="Bewerken"
                              >
                                <Pencil size={11}/>
                              </button>
                              <button
                                onClick={() => deleteExamScore(s.id, sem)}
                                className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                title="Verwijderen"
                              >
                                <X size={11}/>
                              </button>
                            </div>
                          ) : (
                            /* ── empty cell ── */
                            <button
                              onClick={() => openEdit(s.id, sem)}
                              className="text-gray-300 hover:text-amber-500 transition-colors p-1 rounded hover:bg-amber-50"
                              title="Score invoeren"
                            >
                              <Plus size={14}/>
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
