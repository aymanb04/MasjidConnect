'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase/singleton'
import { computeRapportLines, recalculateCard, SkipError } from '@/lib/rapport'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, LoadError } from '@/components/ui/PageShell'
import { FileText, Loader2, Sparkles, ChevronRight, CheckCircle2, PencilLine, RefreshCw, Printer } from 'lucide-react'

type Student = { id: string; first_name: string; last_name: string }
type CardRow = { id: string; student_id: string; status: 'draft' | 'published' }

type BulkReport = { verb: string; made: number; skipped: string[]; failed: string[] }

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
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkReport, setBulkReport]     = useState<BulkReport | null>(null)
  const [err, setErr]             = useState<string | null>(null)
  const [loadErr, setLoadErr]     = useState<unknown>(null)

  const isStaff = profile ? STAFF.includes(profile.role) : false
  const isAdmin = profile ? ['admin', 'super_admin'].includes(profile.role) : false

  useEffect(() => {
    if (!profile) return
    loadData()
  }, [profile, semester])

  async function loadData() {
    setLoading(true); setErr(null); setLoadErr(null)
    const supabase = getSupabase()
    const tid = profile!.tenant_id

    const { data: yr, error: yrErr } = await supabase.from('school_years')
      .select('id, name').eq('tenant_id', tid).eq('is_active', true).maybeSingle()
    if (yrErr) { console.error(yrErr); setLoadErr(yrErr); setLoading(false); return }
    setYear(yr ?? null)

    if (!yr) { setLoading(false); return }

    if (!isStaff) {
      // Student: their own cards (RLS returns only published)
      const { data: mine, error: mineErr } = await supabase.from('rapport_cards')
        .select('id, student_id, status').eq('student_id', profile!.id).eq('school_year_id', yr.id).eq('semester', semester)
      if (mineErr) { console.error(mineErr); setLoadErr(mineErr); setLoading(false); return }
      setMyCards(mine ?? [])
      setLoading(false)
      return
    }

    // Staff: the students they may see + existing cards for this semester
    let studentList: Student[] = []
    if (isAdmin || profile!.role === 'leerlingenbegeleiding') {
      const { data, error } = await supabase.from('profiles')
        .select('id, first_name, last_name')
        .eq('tenant_id', tid).eq('role', 'student').eq('is_active', true).order('last_name')
      if (error) { console.error(error); setLoadErr(error); setLoading(false); return }
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

    const { data: cardRows, error: cardErr } = await supabase.from('rapport_cards')
      .select('id, student_id, status').eq('tenant_id', tid).eq('school_year_id', yr.id).eq('semester', semester)
    if (cardErr) { console.error(cardErr); setLoadErr(cardErr); setLoading(false); return }
    const map: Record<string, CardRow> = {}
    ;(cardRows ?? []).forEach((c: any) => { map[c.student_id] = c })
    setCards(map)
    setLoading(false)
  }

  // ── Generation (admin) — builds a draft card + one line per subject, scores
  //    auto-filled by lib/rapport (the same average as the Puntenlijst). ──────
  async function generateForStudent(studentId: string): Promise<string> {
    const supabase = getSupabase()
    const tid = profile!.tenant_id
    if (!year) throw new Error('geen actief schooljaar')

    // Work the scores out before writing anything.
    const { level, lines: computed } = await computeRapportLines(studentId, year.id, semester)
    const lines = computed.map(l => ({ ...l, comment: '' }))

    const { data: card, error } = await supabase.from('rapport_cards').insert({
      tenant_id: tid, student_id: studentId, school_year_id: year.id, semester,
      status: 'draft', level_snapshot: level, generated_by: profile!.id,
    }).select('id').single()
    if (error) throw new Error(`rapport aanmaken mislukt: ${error.message}`)

    const { error: lerr } = await supabase.from('rapport_lines')
      .insert(lines.map(l => ({ ...l, rapport_card_id: card.id })))
    if (lerr) {
      // The card and its lines are two inserts. An empty card would block a
      // retry (one card per pupil per semester), so take it back out.
      const { data: gone } = await supabase.from('rapport_cards').delete().eq('id', card.id).select('id')
      if (!gone?.length) {
        throw new Error(`vakken opslaan mislukt (${lerr.message}); er staat nu een leeg rapport, verwijder het en probeer opnieuw`)
      }
      throw new Error(`vakken opslaan mislukt: ${lerr.message}`)
    }
    return card.id
  }

  async function handleGenerate(studentId: string) {
    setBusy(studentId); setErr(null); setBulkReport(null)
    try {
      const cardId = await generateForStudent(studentId)
      router.push(`/rapporten/${cardId}`)
    } catch (e: any) {
      const s = students.find(x => x.id === studentId)
      const who = s ? `${s.first_name} ${s.last_name}` : 'Deze leerling'
      setErr(e instanceof SkipError ? `${who} ${e.message}.` : `Genereren mislukt: ${e.message || 'onbekende fout'}`)
      setBusy(null)
    }
  }

  async function handleBulk() {
    if (!confirm('Rapporten aanmaken voor alle leerlingen zonder rapport? Scores worden automatisch ingevuld (aanpasbaar).')) return
    // A pupil without classes this year is expected (skipped); anything else is
    // an error the admin has to see. These used to be swallowed without a trace.
    await runBulk('aangemaakt', students.filter(s => !cards[s.id]), s => generateForStudent(s.id))
  }

  const drafts = students.filter(s => cards[s.id]?.status === 'draft')

  // Scores on a card are a snapshot from the day it was made. Run this after the
  // last grades are in, before teachers write their comments.
  async function handleRecalcAll() {
    if (!year) return
    if (!confirm(
      `De scores van ${drafts.length} ${drafts.length === 1 ? 'concept' : 'concepten'} opnieuw berekenen uit de puntenlijst?

` +
      'Commentaar blijft staan. Een score die iemand met de hand heeft aangepast, wordt overschreven. ' +
      'Gepubliceerde rapporten veranderen niet.'
    )) return
    await runBulk('bijgewerkt', drafts, s => recalculateCard({
      id: cards[s.id].id, student_id: s.id, school_year_id: year.id, semester, status: 'draft',
    }))
  }

  async function handlePublishAll() {
    // Say how many still have an empty score: publishing is when families see it.
    const { data: empty } = await getSupabase().from('rapport_lines')
      .select('rapport_card_id').in('rapport_card_id', drafts.map(s => cards[s.id].id)).is('result', null)
    const emptyCards = new Set((empty ?? []).map((r: any) => r.rapport_card_id)).size
    if (!confirm(
      `${drafts.length} ${drafts.length === 1 ? 'rapport' : 'rapporten'} publiceren? Leerlingen en ouders zien ze dan meteen.` +
      (emptyCards ? `

Let op: ${emptyCards} ${emptyCards === 1 ? 'rapport heeft' : 'rapporten hebben'} nog een vak zonder score.` : '')
    )) return
    await runBulk('gepubliceerd', drafts, async s => {
      const { data, error } = await getSupabase().from('rapport_cards').update({
        status: 'published', published_by: profile!.id, published_at: new Date().toISOString(),
      }).eq('id', cards[s.id].id).eq('status', 'draft').select('id')
      if (error) throw new Error(error.message)
      // RLS refuses with zero rows, not an error.
      if (!data?.length) throw new Error('niet toegestaan')
    })
  }

  async function runBulk(verb: string, todo: Student[], one: (s: Student) => Promise<unknown>) {
    setBulk(true); setErr(null); setBulkReport(null)
    const report: BulkReport = { verb, made: 0, skipped: [], failed: [] }
    for (let i = 0; i < todo.length; i++) {
      const s = todo[i]
      setBulkProgress({ done: i, total: todo.length })
      const name = `${s.first_name} ${s.last_name}`
      try { await one(s); report.made++ }
      catch (e: any) {
        if (e instanceof SkipError) report.skipped.push(`${name} (${e.message})`)
        else report.failed.push(`${name}: ${e.message || 'onbekende fout'}`)
      }
    }
    setBulkProgress(null)
    setBulk(false)
    await loadData()
    setBulkReport(report)
  }

  if (profileLoading || loading) return <PageLoader />
  if (loadErr) return (
    <div className="animate-slide-up">
      <div className="mb-6"><h1 className="page-title">Rapporten</h1></div>
      <LoadError error={loadErr} onRetry={loadData} retrying={loading} />
    </div>
  )

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
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {bulkProgress && (
                    <span className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" /> Bezig… {bulkProgress.done} van {bulkProgress.total}
                    </span>
                  )}
                  {!bulkRunning && students.some(s => !cards[s.id]) && (
                    <button onClick={handleBulk} className="btn-secondary text-sm flex items-center gap-1.5">
                      <Sparkles size={14} /> Genereer voor alle leerlingen zonder rapport
                    </button>
                  )}
                  {!bulkRunning && drafts.length > 0 && (
                    <button onClick={handleRecalcAll} className="btn-secondary text-sm flex items-center gap-1.5"
                      title="Haal de scores van alle concepten opnieuw uit de puntenlijst">
                      <RefreshCw size={14} /> Scores bijwerken ({drafts.length})
                    </button>
                  )}
                  {!bulkRunning && drafts.length > 0 && (
                    <button onClick={handlePublishAll} className="btn-secondary text-sm flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Alles publiceren ({drafts.length})
                    </button>
                  )}
                  {!bulkRunning && Object.keys(cards).length > 0 && (
                    <a href={`/afdrukken/rapporten?semester=${semester}`} target="_blank" rel="noopener"
                      className="btn-secondary text-sm flex items-center gap-1.5">
                      <Printer size={14} /> Afdrukken
                    </a>
                  )}
                </div>
              )}

              {bulkReport && (
                <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${bulkReport.failed.length
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : 'text-green-800 bg-green-50 border-green-200'}`}>
                  <p className="font-medium">
                    {bulkReport.made} {bulkReport.made === 1 ? 'rapport' : 'rapporten'} {bulkReport.verb}
                    {bulkReport.failed.length > 0 && `, ${bulkReport.failed.length} mislukt`}
                    {bulkReport.skipped.length > 0 && `, ${bulkReport.skipped.length} overgeslagen`}.
                  </p>
                  {bulkReport.failed.length > 0 && (
                    <>
                      <p className="mt-1">Niet gelukt (probeer deze leerlingen opnieuw):</p>
                      <ul className="list-disc pl-5 mt-0.5">{bulkReport.failed.map(f => <li key={f}>{f}</li>)}</ul>
                    </>
                  )}
                  {bulkReport.skipped.length > 0 && (
                    <>
                      <p className="mt-1 text-gray-600">Overgeslagen:</p>
                      <ul className="list-disc pl-5 mt-0.5 text-gray-600">{bulkReport.skipped.map(f => <li key={f}>{f}</li>)}</ul>
                    </>
                  )}
                </div>
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
