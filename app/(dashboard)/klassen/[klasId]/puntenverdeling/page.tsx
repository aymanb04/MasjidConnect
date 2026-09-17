'use client'

// Puntenverdeling: how the final mark for one class is put together.
//
// De Kroon asked whether "huiswerk 25% / progressie 40% / examen 30% /
// tajweed 5%" could be applied. It could not -- the rapport pooled homework and
// tests into one average and ignored exams. This screen is where a school sets
// its own split, in its own words.
//
// Written for a teacher, not a developer: rows of "naam · waar komt het cijfer
// vandaan · hoeveel procent", a running total that has to reach 100, and three
// presets to start from. No jargon, no ids, nothing to calculate by hand.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, LoadError } from '@/components/ui/PageShell'
import { ArrowLeft, Plus, Trash2, Check, AlertTriangle, Loader2, Copy } from 'lucide-react'
import {
  SOURCE_LABELS, PRESETS, totalWeight, duplicateAutoSource,
  type GradeSource, type GradeCategory,
} from '@/lib/grading'

type Row = {
  id?: string
  name: string
  source: GradeSource
  weight: number | ''
  sort_order: number
}

export default function PuntenverdelingPage() {
  const { klasId } = useParams<{ klasId: string }>()
  const router = useRouter()
  const { profile, loading: profileLoading } = useProfile()

  const [klas, setKlas]       = useState<any>(null)
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<unknown>(null)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [siblings, setSiblings] = useState<any[]>([])
  const [copyTo, setCopyTo]     = useState<Set<string>>(new Set())
  const [copying, setCopying]   = useState(false)

  const canEdit = ['admin', 'super_admin', 'teacher'].includes(profile?.role ?? '')

  useEffect(() => { if (!profileLoading && profile) load() }, [profileLoading, profile, klasId])

  async function load() {
    setLoading(true); setLoadErr(null)
    const { data: k, error: kErr } = await supabase
      .from('classes').select('id, name, tenant_id, school_year_id, groups(name)')
      .eq('id', klasId).single()
    if (kErr) { setLoadErr(kErr); setLoading(false); return }
    setKlas(k)

    const { data: cats, error: cErr } = await supabase
      .from('grade_categories').select('*').eq('class_id', klasId).order('sort_order')
    if (cErr) { setLoadErr(cErr); setLoading(false); return }
    setRows((cats ?? []).map((c: any) => ({
      id: c.id, name: c.name, source: c.source, weight: Number(c.weight), sort_order: c.sort_order,
    })))

    // Other classes in the same school year, to copy this split to. A school
    // grades Qur'an the same way in every group; retyping it seven times is how
    // mistakes get in.
    const { data: sib } = await supabase
      .from('classes').select('id, name, groups(name)')
      .eq('tenant_id', (k as any).tenant_id)
      .eq('school_year_id', (k as any).school_year_id)
      .eq('is_archived', false).neq('id', klasId)
    setSiblings(sib ?? [])
    setLoading(false)
  }

  const total   = totalWeight(rows.map(r => ({ weight: Number(r.weight) || 0 })))
  const dupe    = duplicateAutoSource(rows.map((r, i) => ({
    id: String(i), name: r.name, source: r.source, weight: Number(r.weight) || 0,
  })) as GradeCategory[])
  const blank   = rows.some(r => !r.name.trim())
  const isHundred = Math.abs(total - 100) < 0.01
  const canSave = canEdit && rows.length > 0 && isHundred && !dupe && !blank

  function setRow(i: number, patch: Partial<Row>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setSaved(false)
  }
  function addRow() {
    setRows(rs => [...rs, { name: '', source: 'handmatig', weight: '', sort_order: rs.length }])
    setSaved(false)
  }
  function removeRow(i: number) {
    setRows(rs => rs.filter((_, j) => j !== i)); setSaved(false)
  }
  function applyPreset(p: typeof PRESETS[number]) {
    setRows(p.rows.map((r, i) => ({ name: r.name, source: r.source, weight: r.weight, sort_order: i })))
    setSaved(false)
  }

  async function save() {
    if (!canSave) return
    setSaving(true); setErr(null)
    // Replace wholesale: the set is small and this keeps deletes, renames and
    // reweights in one step instead of three kinds of diff.
    const { error: delErr } = await supabase.from('grade_categories').delete().eq('class_id', klasId)
    if (delErr) { setErr('Opslaan mislukt: ' + delErr.message); setSaving(false); return }
    const { error: insErr } = await supabase.from('grade_categories').insert(
      rows.map((r, i) => ({
        tenant_id: klas.tenant_id, class_id: klasId,
        name: r.name.trim(), source: r.source, weight: Number(r.weight) || 0, sort_order: i,
      })),
    )
    if (insErr) { setErr('Opslaan mislukt: ' + insErr.message); setSaving(false); return }
    setSaving(false); setSaved(true)
    await load()
  }

  async function clearAll() {
    if (!confirm('Puntenverdeling verwijderen? Deze klas gebruikt dan weer het gewone gemiddelde over huiswerk en toetsen.')) return
    setSaving(true)
    await supabase.from('grade_categories').delete().eq('class_id', klasId)
    setRows([]); setSaving(false); setSaved(false)
  }

  async function copyToClasses() {
    if (copyTo.size === 0) return
    setCopying(true); setErr(null)
    const ids = Array.from(copyTo)
    const { error: delErr } = await supabase.from('grade_categories').delete().in('class_id', ids)
    if (delErr) { setErr('Kopiëren mislukt: ' + delErr.message); setCopying(false); return }
    const payload = ids.flatMap(cid => rows.map((r, i) => ({
      tenant_id: klas.tenant_id, class_id: cid,
      name: r.name.trim(), source: r.source, weight: Number(r.weight) || 0, sort_order: i,
    })))
    const { error: insErr } = await supabase.from('grade_categories').insert(payload)
    if (insErr) { setErr('Kopiëren mislukt: ' + insErr.message); setCopying(false); return }
    setCopying(false); setCopyTo(new Set())
    alert(`Puntenverdeling gekopieerd naar ${ids.length} klas${ids.length === 1 ? '' : 'sen'}.`)
  }

  if (profileLoading || loading) return <PageLoader />
  if (loadErr) return (
    <div className="animate-slide-up max-w-3xl">
      <div className="page-header mb-6"><h1 className="page-title">Puntenverdeling</h1></div>
      <LoadError error={loadErr} onRetry={load} retrying={loading} />
    </div>
  )

  return (
    <div className="animate-slide-up max-w-3xl">
      <button onClick={() => router.push(`/klassen/${klasId}`)}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-3">
        <ArrowLeft size={13}/> Terug naar {klas?.name}
      </button>

      <div className="page-header mb-5">
        <div>
          <h1 className="page-title">Puntenverdeling</h1>
          <p className="page-subtitle">
            Bepaal hoe het eindcijfer voor {klas?.name} wordt samengesteld.
          </p>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="card p-4 mb-5">
          <p className="text-sm text-gray-700 mb-1">Deze klas heeft nog geen puntenverdeling.</p>
          <p className="text-xs text-gray-500 mb-4">
            Zonder verdeling telt het rapport het gewone gemiddelde over alle huiswerkpunten
            en toetsen samen — dat blijft zo tot je hier iets instelt.
          </p>
          <p className="text-xs font-medium text-gray-600 mb-2">Begin met een voorbeeld:</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="btn-secondary text-xs py-1.5 px-3" title={p.hint}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 bg-gray-50 border-b border-border
                          text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-4">Onderdeel</div>
            <div className="col-span-6">Waar komt het cijfer vandaan?</div>
            <div className="col-span-2 text-right">Weegt mee</div>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border items-center">
              <div className="col-span-12 sm:col-span-4">
                <input
                  value={r.name}
                  onChange={e => setRow(i, { name: e.target.value })}
                  placeholder="bv. Progressie"
                  disabled={!canEdit}
                  className="input text-sm w-full"
                />
              </div>
              <div className="col-span-8 sm:col-span-6">
                <select
                  value={r.source}
                  onChange={e => setRow(i, { source: e.target.value as GradeSource })}
                  disabled={!canEdit}
                  className="input text-sm w-full"
                >
                  {(Object.keys(SOURCE_LABELS) as GradeSource[]).map(s => (
                    <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3 sm:col-span-1 flex items-center gap-1 justify-end">
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={r.weight}
                  onChange={e => setRow(i, { weight: e.target.value === '' ? '' : Number(e.target.value) })}
                  disabled={!canEdit}
                  className="input text-sm w-16 text-right"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
              <div className="col-span-1 flex justify-end">
                {canEdit && (
                  <button onClick={() => removeRow(i)} title="Verwijderen"
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className={`flex items-center justify-between px-4 py-3 ${
            isHundred ? 'bg-green-50' : 'bg-amber-50'}`}>
            <span className="text-xs font-medium text-gray-600">Totaal</span>
            <span className={`text-sm font-semibold ${isHundred ? 'text-green-700' : 'text-amber-700'}`}>
              {total}% {isHundred ? '' : `— nog ${Math.round((100 - total) * 10) / 10}% te verdelen`}
            </span>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={addRow} className="btn-secondary text-xs py-1.5 px-3">
            <Plus size={13}/> Onderdeel toevoegen
          </button>
          <button onClick={save} disabled={!canSave || saving}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40">
            {saving ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>} Opslaan
          </button>
          {rows.length > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 px-2">
              Verdeling verwijderen
            </button>
          )}
          {saved && <span className="text-xs text-green-600">Opgeslagen</span>}
        </div>
      )}

      {(dupe || blank || (!isHundred && rows.length > 0)) && (
        <div className="card p-3 mb-4 flex items-start gap-2 bg-amber-50 border-amber-200">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-amber-800 space-y-0.5">
            {blank && <p>Geef elk onderdeel een naam.</p>}
            {dupe && <p>“{SOURCE_LABELS[dupe]}” staat er twee keer in. Kies die bron maar één keer.</p>}
            {!isHundred && <p>De percentages moeten samen precies 100% zijn.</p>}
          </div>
        </div>
      )}

      {err && <div className="card p-3 mb-4 text-xs text-red-600">{err}</div>}

      <div className="card p-4 text-xs text-gray-500 space-y-1.5 mb-5">
        <p className="font-medium text-gray-600">Hoe het werkt</p>
        <p>
          Onderdelen die automatisch gaan, rekenen zichzelf uit: huiswerk uit de gequoteerde
          opdrachten, toetsen uit de puntenlijst, examen uit het examencijfer.
        </p>
        <p>
          Onderdelen op “leerkracht vult zelf een cijfer in” vul je per leerling in op de
          Puntenlijst van deze klas — bv. progressie of tajweed.
        </p>
        <p>
          Is een onderdeel nog niet ingevuld, dan telt het nog niet mee en wordt de rest
          herrekend. Een leerling staat dus niet lager omdat het jaar nog niet om is.
        </p>
      </div>

      {rows.length > 0 && siblings.length > 0 && canEdit && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">
            <Copy size={13} className="inline mr-1 -mt-0.5"/> Dezelfde verdeling elders gebruiken
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Sla eerst op. De gekozen klassen krijgen exact deze verdeling; een bestaande
            verdeling daar wordt vervangen.
          </p>
          <div className="max-h-56 overflow-y-auto divide-y divide-border border border-border rounded-lg mb-3">
            {siblings.map(s => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={copyTo.has(s.id)}
                  onChange={e => setCopyTo(prev => {
                    const next = new Set(prev)
                    e.target.checked ? next.add(s.id) : next.delete(s.id)
                    return next
                  })}/>
                <span className="text-gray-700">{s.name}</span>
                <span className="text-xs text-gray-400">{s.groups?.name}</span>
              </label>
            ))}
          </div>
          <button onClick={copyToClasses} disabled={copyTo.size === 0 || copying}
            className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">
            {copying ? <Loader2 size={13} className="animate-spin"/> : <Copy size={13}/>}
            Kopiëren naar {copyTo.size} klas{copyTo.size === 1 ? '' : 'sen'}
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-5">
        <Link href={`/klassen/${klasId}/scores`} className="hover:text-gray-600 underline">
          Naar de puntenlijst van deze klas
        </Link>
      </p>
    </div>
  )
}
