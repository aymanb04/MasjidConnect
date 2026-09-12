'use client'

// School documents per tenant — the schoolreglement first, but built generically
// so the schoolkalender and the next brief cost nothing.
//
// WHAT AN ACKNOWLEDGEMENT MEANS HERE, precisely: this signed-in person confirmed
// they read version N, at this moment. It is NOT a parent's signature, and no
// label in this file may suggest otherwise. Parents have no accounts; some
// pupils are 16-17 and start on their own; many parents are unreachable after
// enrolment. A record saying "ouder getekend" that a child clicked is the
// evidence that collapses exactly when the school needs it.
//
// That is legally fine: the binding agreement is the enrolment, which a parent
// signed on paper. The reglement is rules under it, so what has to be shown is
// that people were informed — which is what this records.
//
// School's decisions (2026-09-11): not acknowledging FLAGS a pupil, it does not
// block them; teachers may consult the documents too.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, LoadError } from '@/components/ui/PageShell'
import { SignedFileLink } from '@/components/SignedFileLink'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { FileText, CheckCircle2, Loader2, Upload, Users, AlertCircle } from 'lucide-react'

const DOC_TYPES: Record<string, string> = {
  reglement: 'Schoolreglement', kalender: 'Kalender', brief: 'Brief', other: 'Document',
}
const MAX_SIZE = 10 * 1024 * 1024

export default function SchooldocumentenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [docs, setDocs]       = useState<any[]>([])
  const [acks, setAcks]       = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<unknown>(null)
  const [busy, setBusy]       = useState<string | null>(null)
  const [error, setError]     = useState('')
  const [docType, setDocType] = useState('reglement')
  const [title, setTitle]     = useState('Schoolreglement')
  const [showWho, setShowWho] = useState<string | null>(null)

  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '')

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true); setLoadErr(null)
    // Separate queries — a nested join across RLS-protected tables silently
    // returns nothing here.
    const [{ data: d, error: dErr }, { data: a }] = await Promise.all([
      supabase.from('tenant_documents').select('*')
        .eq('tenant_id', profile!.tenant_id).order('created_at', { ascending: false }),
      supabase.from('tenant_document_acks').select('document_id, user_id, version, acked_at'),
    ])
    if (dErr) { console.error(dErr); setLoadErr(dErr); setLoading(false); return }
    setDocs(d ?? [])
    setAcks(a ?? [])

    if (['admin', 'super_admin'].includes(profile!.role)) {
      const { data: m } = await supabase.from('profiles')
        .select('id, first_name, last_name, role')
        .eq('tenant_id', profile!.tenant_id).eq('is_active', true).order('last_name')
      setMembers(m ?? [])
    }
    setLoading(false)
  }

  const myAck = (doc: any) =>
    acks.find(a => a.document_id === doc.id && a.user_id === profile!.id && a.version === doc.version)

  async function acknowledge(doc: any) {
    setBusy(doc.id); setError('')
    const { error: err } = await supabase.from('tenant_document_acks').insert({
      tenant_id: profile!.tenant_id, document_id: doc.id,
      user_id: profile!.id, version: doc.version,
    })
    if (err) {
      console.error('[schooldocumenten] ack:', err)
      setError('Bevestigen is niet gelukt. Probeer het opnieuw.')
    } else {
      await load()
    }
    setBusy(null)
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>, existing?: any) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > MAX_SIZE) { setError('Bestand te groot (max 10 MB).'); return }
    setBusy(existing?.id ?? 'new'); setError('')

    const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${profile!.tenant_id}/${Date.now()}_${safe}`
    const { error: upErr } = await supabase.storage.from('tenant-documents').upload(path, file)
    if (upErr) { console.error(upErr); setError('Upload mislukt.'); setBusy(null); return }

    // Replacing bumps the version, which re-asks everyone. That is the point:
    // nobody should have to guess which text a person actually confirmed.
    const { error: dbErr } = existing
      ? await supabase.from('tenant_documents').update({
          file_name: file.name, file_url: path, version: existing.version + 1,
        }).eq('id', existing.id)
      : await supabase.from('tenant_documents').insert({
          tenant_id: profile!.tenant_id, doc_type: docType,
          title: title.trim() || DOC_TYPES[docType], file_name: file.name,
          file_url: path, uploaded_by: profile!.id,
        })

    if (dbErr) {
      console.error(dbErr)
      await supabase.storage.from('tenant-documents').remove([path])
      setError('Opslaan van het document is mislukt.')
    } else {
      await load()
    }
    setBusy(null)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!profile) return null
  if (loadErr) return (
    <div className="animate-slide-up">
      <div className="page-header"><h1 className="page-title">Schooldocumenten</h1></div>
      <LoadError error={loadErr} onRetry={load} retrying={loading} />
    </div>
  )

  return (
    <div className="animate-slide-up max-w-3xl">
      <div className="page-header">
        <h1 className="page-title">Schooldocumenten</h1>
        <p className="page-subtitle">Het reglement en andere documenten van de school</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
      )}

      {docs.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={22} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            {isAdmin ? 'Nog geen documenten. Voeg hieronder het schoolreglement toe.'
                     : 'De school heeft nog geen documenten toegevoegd.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map(doc => {
            const mine = myAck(doc)
            const forVersion = acks.filter(a => a.document_id === doc.id && a.version === doc.version)
            const ackedIds = new Set(forVersion.map(a => a.user_id))
            return (
              <div key={doc.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <span className="stat-icon bg-primary-50 flex-shrink-0">
                    <FileText size={18} className="text-primary-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{doc.title}</h2>
                      <span className="badge bg-gray-100 text-gray-500">{DOC_TYPES[doc.doc_type] ?? doc.doc_type}</span>
                      <span className="badge bg-gray-100 text-gray-500">versie {doc.version}</span>
                    </div>
                    <SignedFileLink bucket="tenant-documents" path={doc.file_url}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline">
                      {doc.file_name} openen
                    </SignedFileLink>

                    {doc.requires_ack && (
                      mine ? (
                        <p className="mt-3 flex items-center gap-1.5 text-sm text-primary-700">
                          <CheckCircle2 size={15} />
                          Gelezen en bevestigd op {format(new Date(mine.acked_at), 'd MMMM yyyy', { locale: nl })}
                        </p>
                      ) : (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm text-amber-900">
                            Lees dit document en bevestig hieronder dat je het gelezen hebt.
                          </p>
                          <button onClick={() => acknowledge(doc)} disabled={busy === doc.id}
                            className="btn-primary mt-2.5 text-sm">
                            {busy === doc.id
                              ? <><Loader2 size={14} className="animate-spin" /> Bezig…</>
                              : 'Ik heb dit gelezen'}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => setShowWho(showWho === doc.id ? null : doc.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600">
                        <Users size={13} />
                        {forVersion.length} van {members.length} bevestigd
                      </button>
                      <label className="btn-secondary flex cursor-pointer items-center gap-1.5 text-xs py-1.5 px-3">
                        {busy === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        Nieuwe versie
                        <input type="file" accept="application/pdf" className="hidden"
                          onChange={e => upload(e, doc)} disabled={!!busy} />
                      </label>
                    </div>

                    {showWho === doc.id && (
                      <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
                        {members.map(m => (
                          <div key={m.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                            {ackedIds.has(m.id)
                              ? <CheckCircle2 size={13} className="flex-shrink-0 text-primary-600" />
                              : <AlertCircle size={13} className="flex-shrink-0 text-amber-500" />}
                            <span className="truncate text-sm text-gray-700">{m.first_name} {m.last_name}</span>
                            <span className="ml-auto text-xs text-gray-400">
                              {ackedIds.has(m.id) ? 'bevestigd' : 'nog niet'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-xs leading-relaxed text-gray-400">
                      Dit is een bevestiging door de aangemelde persoon zelf — geen handtekening
                      van een ouder. De handtekening van de ouder staat op het inschrijvingsformulier.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <div className="card mt-4 p-5">
          <h2 className="font-semibold text-gray-900">Document toevoegen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="dt" className="label">Soort</label>
              <select id="dt" className="input" value={docType}
                onChange={e => { setDocType(e.target.value); setTitle(DOC_TYPES[e.target.value]) }}>
                {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ti" className="label">Titel</label>
              <input id="ti" className="input" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <label className="btn-primary flex cursor-pointer items-center justify-center gap-1.5">
              {busy === 'new' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              PDF kiezen
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => upload(e)} disabled={!!busy} />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">PDF, maximaal 10 MB.</p>
        </div>
      )}
    </div>
  )
}
