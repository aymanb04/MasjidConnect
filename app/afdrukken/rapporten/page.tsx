'use client'

// Printing rapporten: one card (?ids=<id>) or a whole semester (?semester=1),
// each on its own A4 page, so a school gets one PDF per group to hand out.
//
// A top-level route, outside the dashboard layout, on purpose. The layout is a
// fixed-height box with a scrolling <main>; printing from inside it clipped the
// rapport to that box, and the third subject and the signature lines never
// reached the paper (found in the rapport dry run, 2026-10-31).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import RapportDocument from '@/components/features/rapport/RapportDocument'
import { Printer, Loader2 } from 'lucide-react'

type Card = {
  id: string; student_id: string; school_year_id: string; tenant_id: string
  semester: 1 | 2; status: 'draft' | 'published'; level_snapshot: string | null
}
type Line = { rapport_card_id: string; subject_snapshot: string | null; result: number | null; comment: string | null }

const STAFF = ['admin', 'super_admin', 'teacher', 'leerlingenbegeleiding']

// .in() with a few hundred ids still fits a URL, but a bigger school would not.
async function inChunks<T>(ids: string[], q: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await q(ids.slice(i, i + 100))
    if (error) throw error
    out.push(...(data ?? []))
  }
  return out
}

export default function RapportenAfdrukkenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const [cards, setCards]     = useState<Card[]>([])
  const [lines, setLines]     = useState<Line[]>([])
  const [names, setNames]     = useState<Record<string, { first_name: string; last_name: string }>>({})
  const [tenant, setTenant]   = useState<any>(null)
  const [years, setYears]     = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [group, setGroup]     = useState('')               // '' = all groups
  const [withDrafts, setWithDrafts] = useState(false)

  useEffect(() => {
    if (profileLoading) return
    if (!profile) { router.push('/login'); return }
    load().catch(e => { console.error(e); setErr('Rapporten laden mislukt. Probeer het opnieuw.'); setLoading(false) })
  }, [profileLoading, profile])

  async function load() {
    const supabase = getSupabase()
    const params = new URLSearchParams(window.location.search)
    const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
    const semester = Number(params.get('semester'))

    let list: Card[] = []
    const cols = 'id, student_id, school_year_id, tenant_id, semester, status, level_snapshot'
    if (ids.length) {
      // RLS: a pupil gets their own card only once it is published.
      list = await inChunks<Card>(ids, c => supabase.from('rapport_cards').select(cols).in('id', c))
    } else if ((semester === 1 || semester === 2) && STAFF.includes(profile!.role)) {
      const { data: yr, error: yErr } = await supabase.from('school_years')
        .select('id').eq('tenant_id', profile!.tenant_id).eq('is_active', true).maybeSingle()
      if (yErr) throw yErr
      if (yr) {
        const { data, error } = await supabase.from('rapport_cards').select(cols)
          .eq('tenant_id', profile!.tenant_id).eq('school_year_id', yr.id).eq('semester', semester)
        if (error) throw error
        list = (data ?? []) as Card[]
      }
    }

    const cardIds = list.map(c => c.id)
    const [ln, ppl] = await Promise.all([
      inChunks<Line>(cardIds, c => supabase.from('rapport_lines')
        .select('rapport_card_id, subject_snapshot, result, comment').in('rapport_card_id', c)),
      inChunks<any>(Array.from(new Set(list.map(c => c.student_id))), c => supabase.from('profiles')
        .select('id, first_name, last_name').in('id', c)),
    ])
    const yearIds = Array.from(new Set(list.map(c => c.school_year_id)))
    const [{ data: tn }, { data: yrs }] = await Promise.all([
      supabase.from('tenants').select('name, address, city, email, logo_url').eq('id', profile!.tenant_id).maybeSingle(),
      yearIds.length ? supabase.from('school_years').select('id, name').in('id', yearIds) : Promise.resolve({ data: [] as any[] }),
    ])

    setCards(list)
    setLines(ln)
    setNames(Object.fromEntries(ppl.map((p: any) => [p.id, p])))
    setTenant(tn ?? null)
    setYears(Object.fromEntries((yrs ?? []).map((y: any) => [y.id, y.name])))
    // One card asked for by id: print it whatever its status. A whole semester:
    // only what families may see, unless the admin asks for the drafts too.
    setWithDrafts(ids.length > 0 || !list.some(c => c.status === 'published'))
    setLoading(false)
  }

  const groups = useMemo(
    () => Array.from(new Set(cards.map(c => c.level_snapshot || ''))).sort((a, b) => a.localeCompare(b, 'nl')),
    [cards],
  )

  const shown = useMemo(() => cards
    .filter(c => withDrafts || c.status === 'published')
    .filter(c => !group || (c.level_snapshot || '') === group)
    .sort((a, b) =>
      (a.level_snapshot || '').localeCompare(b.level_snapshot || '', 'nl') ||
      (names[a.student_id]?.last_name ?? '').localeCompare(names[b.student_id]?.last_name ?? '', 'nl') ||
      (names[a.student_id]?.first_name ?? '').localeCompare(names[b.student_id]?.first_name ?? '', 'nl')),
  [cards, withDrafts, group, names])

  const drafts = shown.filter(c => c.status === 'draft').length

  if (profileLoading || (loading && !err)) {
    return <div className="flex h-dvh items-center justify-center text-sm text-gray-500 gap-2"><Loader2 size={16} className="animate-spin" /> Laden…</div>
  }

  return (
    <div className="afdruk">
      <style>{`
        body { background:#e5e7eb; }
        .afdruk .rapport-doc { margin:0 auto 16px; box-shadow:0 1px 4px rgba(0,0,0,.15); }
        @media print {
          body { background:#fff; }
          .no-print { display:none !important; }
          .afdruk .rapport-doc { margin:0; box-shadow:none; break-after:page; }
          .afdruk .rapport-doc:last-child { break-after:auto; }
          @page { size:A4; margin:0; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => window.print()} disabled={!shown.length}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Printer size={14} /> Afdrukken / PDF
        </button>
        {groups.length > 1 && (
          <select value={group} onChange={e => setGroup(e.target.value)} className="input text-sm py-1.5 w-auto">
            <option value="">Alle groepen</option>
            {groups.map(g => <option key={g} value={g}>{g || 'Zonder groep'}</option>)}
          </select>
        )}
        {cards.some(c => c.status === 'draft') && cards.some(c => c.status === 'published') && (
          <label className="text-sm text-gray-700 flex items-center gap-1.5">
            <input type="checkbox" checked={withDrafts} onChange={e => setWithDrafts(e.target.checked)} />
            Ook concepten
          </label>
        )}
        <span className="text-sm text-gray-500">
          {shown.length} {shown.length === 1 ? 'rapport' : 'rapporten'}, één per blad
          {drafts > 0 && <span className="text-amber-700"> · {drafts} {drafts === 1 ? 'is nog een concept' : 'zijn nog concepten'}</span>}
        </span>
        <span className="text-xs text-gray-400 basis-full">
          Kies in het afdrukvenster &quot;Opslaan als PDF&quot; voor een bestand. Zet &quot;Achtergrondafbeeldingen&quot; aan voor de kleuren.
        </span>
      </div>

      {err && <p className="no-print text-center text-sm text-red-600 py-8">{err}</p>}
      {!err && !shown.length && (
        <p className="no-print text-center text-sm text-gray-500 py-8">Geen rapporten om af te drukken.</p>
      )}

      {shown.map(c => {
        const n = names[c.student_id]
        return (
          <RapportDocument
            key={c.id}
            schoolName={tenant?.name ?? 'MasjidConnect'}
            schoolLines={tenant ? [tenant.address, tenant.city, tenant.email].filter(Boolean) : []}
            logoUrl={tenant?.logo_url}
            studentName={n ? `${n.first_name} ${n.last_name}` : ''}
            level={c.level_snapshot ?? ''}
            schoolYearName={years[c.school_year_id] ?? ''}
            semester={c.semester}
            lines={lines
              .filter(l => l.rapport_card_id === c.id)
              .sort((a, b) => (a.subject_snapshot ?? '').localeCompare(b.subject_snapshot ?? '', 'nl'))
              .map(l => ({ subjectNl: l.subject_snapshot ?? '', result: l.result, comment: l.comment ?? '' }))}
          />
        )
      })}
    </div>
  )
}
