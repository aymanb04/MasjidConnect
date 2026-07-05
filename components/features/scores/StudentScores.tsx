'use client'

// Read-only "Mijn punten" — a student's own scores for one class. Mirrors the
// staff Puntenlijst (same weighted average: Σscore/Σmax over graded homework +
// tests; exams shown separately, not in the average) but scoped to the caller via
// RLS-safe self-queries.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { ArrowLeft, GraduationCap, FileText, ClipboardList } from 'lucide-react'

type Item = {
  key: string
  title: string
  max: number | null
  score: number | null
  submitted: boolean
  kind: 'huiswerk' | 'toets'
}

function scoreColor(score: number | null, max: number | null) {
  if (score === null || !max) return 'bg-gray-100 text-gray-500'
  const pct = score / max
  if (pct >= 0.7) return 'bg-green-100 text-green-700'
  if (pct >= 0.5) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}
const round1 = (n: number) => Math.round(n * 10) / 10

export default function StudentScores() {
  const { klasId } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const [klas, setKlas]   = useState<any>(null)
  const [items, setItems] = useState<Item[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [avg, setAvg]     = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile || !klasId) return
    load()
  }, [profile, klasId])

  async function load() {
    const supabase = getSupabase()
    const sid = profile!.id

    const { data: k } = await supabase.from('classes').select('id, name, color').eq('id', klasId).single()
    setKlas(k)

    // Homework (published assignments) → my submission → feedback score
    const { data: assignments } = await supabase
      .from('assignments').select('id, title, max_score')
      .eq('class_id', klasId).eq('is_published', true)
      .order('due_date', { ascending: true })

    let hwItems: Item[] = []
    if (assignments?.length) {
      const { data: subs } = await supabase
        .from('submissions').select('id, assignment_id, status')
        .eq('student_id', sid).in('assignment_id', assignments.map((a: any) => a.id))
      const subByAssign: Record<string, any> = {}
      ;(subs ?? []).forEach((s: any) => { subByAssign[s.assignment_id] = s })
      const subIds = (subs ?? []).map((s: any) => s.id)
      const { data: fbs } = subIds.length
        ? await supabase.from('submission_feedback').select('submission_id, score').in('submission_id', subIds)
        : { data: [] as any[] }
      const scoreBySub: Record<string, number | null> = {}
      ;(fbs ?? []).forEach((f: any) => { scoreBySub[f.submission_id] = f.score ?? null })
      hwItems = assignments.map((a: any) => {
        const sub = subByAssign[a.id]
        return {
          key: 'a' + a.id, title: a.title, max: a.max_score,
          score: sub ? (scoreBySub[sub.id] ?? null) : null,
          submitted: !!sub, kind: 'huiswerk' as const,
        }
      })
    }

    // Manual tests → my test_scores
    const { data: tests } = await supabase
      .from('class_tests').select('id, title, max_score, test_date')
      .eq('class_id', klasId).order('test_date', { ascending: true })
    let testItems: Item[] = []
    if (tests?.length) {
      const { data: ts } = await supabase
        .from('test_scores').select('test_id, score')
        .eq('student_id', sid).in('test_id', tests.map((t: any) => t.id))
      const byTest: Record<string, number> = Object.fromEntries((ts ?? []).map((r: any) => [r.test_id, Number(r.score)]))
      testItems = tests.map((t: any) => ({
        key: 't' + t.id, title: t.title, max: Number(t.max_score),
        score: t.id in byTest ? byTest[t.id] : null,
        submitted: t.id in byTest, kind: 'toets' as const,
      }))
    }

    const all = [...hwItems, ...testItems]
    setItems(all)

    // Weighted average — identical to staff studentAvg (homework + tests only)
    let earned = 0, total = 0
    for (const it of all) {
      if (it.score === null || !it.max) continue
      earned += it.score; total += it.max
    }
    setAvg(total ? (earned / total) * 100 : null)

    const { data: ex } = await supabase.from('exam_scores').select('*')
      .eq('class_id', klasId).eq('student_id', sid)
    setExams(ex ?? [])

    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!klas) return null

  const hasExams = exams.length > 0

  return (
    <div className="animate-slide-up max-w-2xl">
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
            <h1 className="page-title">{klas.name} — Mijn punten</h1>
            <p className="page-subtitle">Je eigen resultaten voor deze klas</p>
          </div>
        </div>
      </div>

      {items.length === 0 && !hasExams ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Nog geen punten voor deze klas.</div>
      ) : (
        <div className="space-y-6">
          {/* Homework & tests + running average */}
          {items.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50/60">
                <h2 className="font-semibold text-sm text-gray-800">Huiswerk &amp; toetsen</h2>
                {avg !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Gemiddelde</span>
                    <span className={`inline-block px-2.5 py-0.5 rounded-lg text-sm font-bold ${scoreColor(avg, 100)}`}>
                      {round1(avg)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="divide-y divide-border">
                {items.map(it => (
                  <div key={it.key} className="flex items-center gap-3 px-4 py-3">
                    {it.kind === 'huiswerk'
                      ? <FileText size={15} className="text-primary-500 flex-shrink-0"/>
                      : <ClipboardList size={15} className="text-amber-500 flex-shrink-0"/>}
                    <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{it.title}</span>
                    {it.score !== null ? (
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-semibold ${scoreColor(it.score, it.max)}`}>
                        {round1(it.score)}{it.max ? `/${it.max}` : ''}
                      </span>
                    ) : it.submitted ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs bg-blue-50 text-blue-500">Ingediend</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 text-xs text-gray-400 border-t border-border">
                Gemiddelde over gequoteerde punten (huiswerk &amp; toetsen). Examens tellen apart.
              </div>
            </div>
          )}

          {/* Exams */}
          {hasExams && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-amber-50/60">
                <GraduationCap size={16} className="text-amber-600"/>
                <h2 className="font-semibold text-sm text-gray-800">Examenresultaten</h2>
              </div>
              <div className="divide-y divide-border">
                {([1, 2] as const).map(sem => {
                  const ex = exams.find((e: any) => e.semester === sem)
                  if (!ex) return null
                  return (
                    <div key={sem} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-800">Examen Semester {sem}</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-sm font-semibold ${scoreColor(ex.score, ex.max_score)}`}>
                        {ex.score}/{ex.max_score}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
