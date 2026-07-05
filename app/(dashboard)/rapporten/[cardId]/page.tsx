'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import RapportDocument from '@/components/features/rapport/RapportDocument'
import { ArrowLeft, Printer, Loader2, CheckCircle2, Undo2, Save, Lock } from 'lucide-react'

type Line = {
  id: string; class_id: string; subject_snapshot: string | null
  result: number | null; comment: string | null
}
type Card = {
  id: string; tenant_id: string; student_id: string; school_year_id: string
  semester: 1 | 2; status: 'draft' | 'published'; level_snapshot: string | null
}

export default function RapportCardPage() {
  const { cardId } = useParams()
  const { profile, loading: profileLoading } = useProfile()

  const [card, setCard]       = useState<Card | null>(null)
  const [lines, setLines]     = useState<Line[]>([])
  const [student, setStudent] = useState<{ first_name: string; last_name: string } | null>(null)
  const [tenant, setTenant]   = useState<any>(null)
  const [yearName, setYearName] = useState('')
  const [editable, setEditable] = useState<Set<string>>(new Set())  // class_ids the caller may edit
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const isAdmin = profile ? ['admin', 'super_admin'].includes(profile.role) : false
  const isOwner = profile && card ? card.student_id === profile.id : false

  useEffect(() => {
    if (!profile || !cardId) return
    loadData()
  }, [profile, cardId])

  async function loadData() {
    setLoading(true)
    const supabase = getSupabase()

    const { data: c } = await supabase.from('rapport_cards')
      .select('id, tenant_id, student_id, school_year_id, semester, status, level_snapshot')
      .eq('id', cardId).maybeSingle()
    if (!c) { setNotFound(true); setLoading(false); return }
    setCard(c as Card)

    const [{ data: ln }, { data: st }, { data: tn }, { data: yr }] = await Promise.all([
      supabase.from('rapport_lines').select('id, class_id, subject_snapshot, result, comment')
        .eq('rapport_card_id', c.id).order('subject_snapshot'),
      supabase.from('profiles').select('first_name, last_name').eq('id', c.student_id).maybeSingle(),
      supabase.from('tenants').select('name, address, city, email, logo_url').eq('id', c.tenant_id).maybeSingle(),
      supabase.from('school_years').select('name').eq('id', c.school_year_id).maybeSingle(),
    ])
    setLines((ln ?? []) as Line[])
    setStudent(st ?? null)
    setTenant(tn ?? null)
    setYearName(yr?.name ?? '')

    // Which subjects may this caller edit?
    if (['admin', 'super_admin'].includes(profile!.role)) {
      setEditable(new Set((ln ?? []).map((l: any) => l.class_id)))
    } else if (profile!.role === 'teacher') {
      const classIds = (ln ?? []).map((l: any) => l.class_id)
      const { data: ct } = classIds.length
        ? await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile!.id).in('class_id', classIds)
        : { data: [] as any[] }
      setEditable(new Set((ct ?? []).map((r: any) => r.class_id)))
    } else {
      setEditable(new Set())
    }
    setLoading(false)
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  const canEditLine = (l: Line) =>
    (isAdmin || editable.has(l.class_id)) && card?.status === 'draft'

  async function saveChanges() {
    if (!card) return
    setSaving(true)
    const supabase = getSupabase()
    const mine = lines.filter(canEditLine)
    for (const l of mine) {
      await supabase.from('rapport_lines')
        .update({ result: l.result, comment: l.comment ?? '', updated_by: profile!.id })
        .eq('id', l.id)
    }
    setSaving(false)
  }

  async function togglePublish() {
    if (!card) return
    setPublishing(true)
    const supabase = getSupabase()
    const next = card.status === 'draft' ? 'published' : 'draft'
    const { error } = await supabase.from('rapport_cards').update({
      status: next,
      published_by: next === 'published' ? profile!.id : null,
      published_at: next === 'published' ? new Date().toISOString() : null,
    }).eq('id', card.id)
    if (!error) setCard({ ...card, status: next })
    setPublishing(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (notFound) return (
    <div className="animate-slide-up max-w-lg">
      <Link href="/rapporten" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={15} /> Terug</Link>
      <div className="card p-8 text-center text-gray-400 text-sm">Dit rapport is niet (meer) beschikbaar.</div>
    </div>
  )
  if (!card) return null

  // Student can only view a published rapport
  if (isOwner && card.status !== 'published') {
    return (
      <div className="animate-slide-up max-w-lg">
        <Link href="/rapporten" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={15} /> Terug</Link>
        <div className="card p-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
          <Lock size={22} className="text-gray-300" />
          Je rapport is nog niet beschikbaar.
        </div>
      </div>
    )
  }

  const studentName = student ? `${student.first_name} ${student.last_name}` : ''
  const schoolLines = tenant ? [tenant.address, tenant.city, tenant.email].filter(Boolean) : []
  const docLines = lines.map(l => ({
    subjectNl: l.subject_snapshot ?? '', result: l.result ?? null, comment: l.comment ?? '',
  }))
  const showEditor = !isOwner && (isAdmin || editable.size > 0)

  return (
    <div className="animate-slide-up">
      {/* toolbar — hidden when printing */}
      <div className="mb-6 no-print">
        <Link href="/rapporten" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={15} /> Terug naar rapporten</Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">{studentName}</h1>
            <p className="page-subtitle">Rapport semester {card.semester} · {yearName}</p>
          </div>
          <div className="flex items-center gap-2">
            {card.status === 'published'
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-lg"><CheckCircle2 size={13} /> Gepubliceerd</span>
              : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">Concept</span>}
            <button onClick={() => window.print()} className="btn-secondary text-sm flex items-center gap-1.5"><Printer size={14} /> Afdrukken / PDF</button>
            {isAdmin && (
              <button onClick={togglePublish} disabled={publishing}
                className={card.status === 'draft' ? 'btn-primary text-sm flex items-center gap-1.5' : 'btn-secondary text-sm flex items-center gap-1.5'}>
                {publishing ? <Loader2 size={14} className="animate-spin" /> : card.status === 'draft' ? <CheckCircle2 size={14} /> : <Undo2 size={14} />}
                {card.status === 'draft' ? 'Publiceren' : 'Terug naar concept'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* editor (staff) */}
      {showEditor && (
        <div className="card mb-6 no-print">
          <div className="px-4 py-3 border-b border-border bg-gray-50/60 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Scores &amp; commentaar per vak</h2>
            {card.status === 'draft'
              ? <button onClick={saveChanges} disabled={saving} className="btn-primary text-xs flex items-center gap-1.5">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Opslaan
                </button>
              : <span className="text-xs text-gray-400">Gepubliceerd — zet terug naar concept om te wijzigen</span>}
          </div>
          <div className="divide-y divide-border">
            {lines.map(l => {
              const editableLine = canEditLine(l)
              return (
                <div key={l.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[160px_100px_1fr] gap-3 items-start">
                  <div className="font-medium text-sm text-gray-800 pt-1.5">{l.subject_snapshot}</div>
                  <div>
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max="100" step="0.1"
                        value={l.result ?? ''} disabled={!editableLine}
                        onChange={e => updateLine(l.id, { result: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        className="input text-sm py-1.5 w-20 disabled:bg-gray-50 disabled:text-gray-500" placeholder="—" />
                      <span className="text-sm text-gray-400">%</span>
                    </div>
                  </div>
                  <textarea rows={2} value={l.comment ?? ''} disabled={!editableLine}
                    onChange={e => updateLine(l.id, { comment: e.target.value })}
                    placeholder={editableLine ? 'Commentaar…' : (l.comment ? '' : 'Geen commentaar')}
                    className="input text-sm py-1.5 resize-y disabled:bg-gray-50 disabled:text-gray-500" />
                </div>
              )
            })}
            {lines.length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">Geen vakken op dit rapport.</div>}
          </div>
          {!isAdmin && (
            <div className="px-4 py-2 text-xs text-gray-400 border-t border-border">Je kunt alleen de vakken bewerken die je zelf geeft.</div>
          )}
        </div>
      )}

      {/* live print preview / the printed document */}
      <div className="card p-4 overflow-x-auto">
        <RapportDocument
          schoolName={tenant?.name ?? 'MasjidConnect'}
          schoolLines={schoolLines}
          logoUrl={tenant?.logo_url}
          studentName={studentName}
          level={card.level_snapshot ?? ''}
          schoolYearName={yearName}
          semester={card.semester}
          lines={docLines}
        />
      </div>
    </div>
  )
}
