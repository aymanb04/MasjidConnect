'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { FileText, Loader2, Sparkles, ChevronRight, CheckCircle2, PencilLine } from 'lucide-react'

type Student = { id: string; first_name: string; last_name: string }
type CardRow = { id: string; student_id: string; status: 'draft' | 'published' }

const STAFF = ['admin', 'super_admin', 'teacher', 'leerlingenbegeleiding']

export default function RapportenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const [semester, setSemester]   = useState<1 | 2>(1)
  const [year, setYear]           = useState<{ id: string; name: string } | null>(null)
  const [students, setStudents]   = useState<Student[]>([])
  const [cards, setCards]         = useState<Record<string, CardRow>>({})   // student_id → card
  const [myCards, setMyCards]     = useState<CardRow[]>([])                  // student's own
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState<string | null>(null)           // student_id being generated
  const [bulkRunning, setBulk]    = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  const isStaff = profile ? STAFF.includes(profile.role) : false
  const isAdmin = profile ? ['admin', 'super_admin'].includes(profile.role) : false

  useEffect(() => {
    if (!profile) return
    loadData()
  }, [profile, semester])

  async function loadData() {
    setLoading(true); setErr(null)
    const supabase = getSupabase()
    const tid = profile!.tenant_id

    const { data: yr } = await supabase.from('school_years')
      .select('id, name').eq('tenant_id', tid).eq('is_active', true).maybeSingle()
    setYear(yr ?? null)

    if (!yr) { setLoading(false); return }

    if (!isStaff) {
      // Student: their own cards (RLS returns only published)
      const { data: mine } = await supabase.from('rapport_cards')
        .select('id, student_id, status').eq('student_id', profile!.id).eq('school_year_id', yr.id).eq('semester', semester)
      setMyCards(mine ?? [])
      setLoading(false)
      return
    }

    // Staff: the students they may see + existing cards for this semester
    let studentList: Student[] = []
    if (isAdmin || profile!.role === 'leerlingenbegeleiding') {
      const { data } = await supabase.from('profiles')
        .select('id, first_name, last_name')
        .eq('tenant_id', tid).eq('role', 'student').eq('is_active', true).order('last_name')
      studentList = data ?? []
    } else {
      // teacher: students in classes they teach (active year)
      const { data: ct } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile!.id)
      const classIds = ct?.map(r => r.class_id) ?? []
      const { data: cls } = classIds.length
        ? await supabase.from('classes').select('id').in('id', classIds).eq('school_year_id', yr.id).eq('is_archived', false)
        : { data: [] as any[] }
      const yearClassIds = cls?.map((c: any) => c.id) ?? []
      const { data: cs } = yearClassIds.length
        ? await supabase.from('class_students').select('student_id').in('class_id', yearClassIds)
        : { data: [] as any[] }
      const studentIds = Array.from(new Set((cs ?? []).map((r: any) => r.student_id)))
      const { data: profs } = studentIds.length
        ? await supabase.from('profiles').select('id, first_name, last_name').in('id', studentIds).eq('is_active', true).order('last_name')
        : { data: [] as any[] }
      studentList = profs ?? []
    }
    setStudents(studentList)

    const { data: cardRows } = await supabase.from('rapport_cards')
      .select('id, student_id, status').eq('tenant_id', tid).eq('school_year_id', yr.id).eq('semester', semester)
    const map: Record<string, CardRow> = {}
    ;(cardRows ?? []).forEach((c: any) => { map[c.student_id] = c })
    setCards(map)
    setLoading(false)
  }

  // ── Generation (admin) — builds a draft card + one line per subject, scores
  //    auto-filled with the gradebook weighted average (Σearned / Σmax). ──────
  async function generateForStudent(studentId: string): Promise<string> {
    const supabase = getSupabase()
    const tid = profile!.tenant_id
    if (!year) throw new Error('geen actief schooljaar')

    const { data: cs } = await supabase.from('class_students').select('class_id').eq('student_id', studentId)
    const enrolled = (cs ?? []).map((r: any) => r.class_id)
    if (!enrolled.length) throw new Error('leerling zit in geen enkele klas')

    const { data: classRows } = await supabase.from('classes')
      .select('id, name, group_id').in('id', enrolled).eq('school_year_id', year.id).eq('is_archived', false)
    const classes = classRows ?? []
    if (!classes.length) throw new Error('geen klassen dit schooljaar')
    const classIds = classes.map((c: any) => c.id)

    let level = ''
    const groupIds = Array.from(new Set(classes.map((c: any) => c.group_id).filter(Boolean)))
    if (groupIds.length) {
      const { data: g } = await supabase.from('groups').select('id, name').in('id', groupIds as string[])
      level = g?.[0]?.name ?? ''
    }

    const { data: assigns } = await supabase.from('assignments')
      .select('id, class_id, max_score').in('class_id', classIds).eq('is_published', true)
    const assignList = assigns ?? []
    const { data: subs } = assignList.length
      ? await supabase.from('submissions').select('id, assignment_id').eq('student_id', studentId).in('assignment_id', assignList.map((a: any) => a.id))
      : { data: [] as any[] }
    const subList = subs ?? []
    const { data: fbs } = subList.length
      ? await supabase.from('submission_feedback').select('submission_id, score').in('submission_id', subList.map((s: any) => s.id))
      : { data: [] as any[] }
    const fbList = fbs ?? []
    const { data: tests } = await supabase.from('class_tests').select('id, class_id, max_score').in('class_id', classIds)
    const testList = tests ?? []
    const { data: tscores } = testList.length
      ? await supabase.from('test_scores').select('test_id, score').eq('student_id', studentId).in('test_id', testList.map((t: any) => t.id))
      : { data: [] as any[] }
    const tsList = tscores ?? []

    function avgForClass(cid: string): number | null {
      let earned = 0, total = 0
      for (const a of assignList.filter((x: any) => x.class_id === cid)) {
        const sub = subList.find((s: any) => s.assignment_id === a.id)
        if (!sub || !a.max_score) continue
        const fb = fbList.find((f: any) => f.submission_id === sub.id)
        if (!fb || fb.score === null || fb.score === undefined) continue
        earned += Number(fb.score); total += Number(a.max_score)
      }
      for (const t of testList.filter((x: any) => x.class_id === cid)) {
        const ts = tsList.find((x: any) => x.test_id === t.id)
        if (!ts || !t.max_score) continue
        earned += Number(ts.score); total += Number(t.max_score)
      }
      if (!total) return null
      return Math.round((earned / total) * 1000) / 10
    }

    const { data: card, error } = await supabase.from('rapport_cards').insert({
      tenant_id: tid, student_id: studentId, school_year_id: year.id, semester,
      status: 'draft', level_snapshot: level, generated_by: profile!.id,
    }).select('id').single()
    if (error) throw error

    const lineRows = classes.map((c: any) => ({
      rapport_card_id: card.id, class_id: c.id, subject_snapshot: c.name,
      result: avgForClass(c.id), comment: '',
    }))
    const { error: lerr } = await supabase.from('rapport_lines').insert(lineRows)
    if (lerr) throw lerr
    return card.id
  }

  async function handleGenerate(studentId: string) {
    setBusy(studentId); setErr(null)
    try {
      const cardId = await generateForStudent(studentId)
      router.push(`/rapporten/${cardId}`)
    } catch (e: any) {
      setErr(e.message || 'Genereren mislukt')
      setBusy(null)
    }
  }

  async function handleBulk() {
    if (!confirm('Rapporten aanmaken voor alle leerlingen zonder rapport? Scores worden automatisch ingevuld (aanpasbaar).')) return
    setBulk(true); setErr(null)
    const todo = students.filter(s => !cards[s.id])
    for (const s of todo) {
      try { await generateForStudent(s.id) } catch { /* skip failures (e.g. no classes) */ }
    }
    setBulk(false)
    await loadData()
  }

  if (profileLoading || loading) return <PageLoader />

  const statusBadge = (status: 'draft' | 'published') => status === 'published'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-lg"><CheckCircle2 size={12} /> Gepubliceerd</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg"><PencilLine size={12} /> Concept</span>

  return (
    <div className="animate-slide-up">
      <div className="mb-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
          <FileText size={22} />
        </div>
        <div>
          <h1 className="page-title">Rapporten</h1>
          <p className="page-subtitle">{year ? year.name : 'Geen actief schooljaar'}</p>
        </div>
      </div>

      {!year ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Er is geen actief schooljaar ingesteld.</div>
      ) : (
        <>
          {/* Semester toggle */}
          <div className="flex items-center gap-2 mb-4">
            {([1, 2] as const).map(s => (
              <button key={s} onClick={() => setSemester(s)}
                className={semester === s ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
                Semester {s}
              </button>
            ))}
          </div>

          {err && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

          {!isStaff ? (
            /* ── Student view: own published rapports ── */
            myCards.length === 0 ? (
              <div className="card p-8 text-center text-gray-400 text-sm">Nog geen rapport beschikbaar voor semester {semester}.</div>
            ) : (
              <div className="card divide-y divide-border">
                {myCards.map(c => (
                  <Link key={c.id} href={`/rapporten/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <span className="font-medium text-gray-800">Rapport semester {semester}</span>
                    <span className="flex items-center gap-2">{statusBadge(c.status)}<ChevronRight size={16} className="text-gray-300" /></span>
                  </Link>
                ))}
              </div>
            )
          ) : (
            /* ── Staff view: student list + generate/open ── */
            <>
              {isAdmin && students.some(s => !cards[s.id]) && (
                <button onClick={handleBulk} disabled={bulkRunning}
                  className="btn-secondary text-sm flex items-center gap-1.5 mb-4">
                  {bulkRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Genereer voor alle leerlingen zonder rapport
                </button>
              )}

              {students.length === 0 ? (
                <div className="card p-8 text-center text-gray-400 text-sm">Geen leerlingen gevonden.</div>
              ) : (
                <div className="card divide-y divide-border">
                  {students.map(s => {
                    const card = cards[s.id]
                    return (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium">
                            {s.first_name[0]}{s.last_name[0]}
                          </div>
                          <span className="font-medium text-gray-800 text-sm">{s.first_name} {s.last_name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {card ? (
                            <>
                              {statusBadge(card.status)}
                              <Link href={`/rapporten/${card.id}`} className="btn-secondary text-xs">Openen</Link>
                            </>
                          ) : isAdmin ? (
                            <button onClick={() => handleGenerate(s.id)} disabled={busy === s.id}
                              className="btn-primary text-xs flex items-center gap-1.5">
                              {busy === s.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Genereren
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Nog niet aangemaakt</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
