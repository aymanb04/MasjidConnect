'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { SignedFileLink } from '@/components/SignedFileLink'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import {
  ArrowLeft, Loader2, Mail, Pencil, Save, X, Plus, Trash2,
  FileText, Upload, GraduationCap, MessageSquare, Users,
} from 'lucide-react'

const STAFF_ROLES = ['admin', 'super_admin', 'teacher', 'leerlingenbegeleiding']
const DOC_TYPES: Record<string, string> = {
  contract: 'Contract', disability: 'Zorg/beperking', other: 'Overig',
}
const MAX_DOC_SIZE = 10 * 1024 * 1024 // 10 MB

interface DetailsForm {
  date_of_birth: string
  gender: string
  address: string
  parent_email: string
  parent_phone: string
  emergency_contact_name: string
  emergency_contact_phone: string
  family_id: string
}

const EMPTY_FORM: DetailsForm = {
  date_of_birth: '', gender: '', address: '', parent_email: '',
  parent_phone: '', emergency_contact_name: '', emergency_contact_phone: '',
  family_id: '',
}

export default function DossierDetailPage() {
  const { profile, loading: profileLoading } = useProfile()
  const params = useParams<{ studentId: string }>()
  const router = useRouter()
  const studentId = params.studentId

  const [student,   setStudent]   = useState<any>(null)
  const [form,      setForm]      = useState<DetailsForm>(EMPTY_FORM)
  const [families,  setFamilies]  = useState<any[]>([])
  const [classes,   setClasses]   = useState<any[]>([])
  const [scores,    setScores]    = useState<any[]>([])
  const [notes,     setNotes]     = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [newNote,   setNewNote]   = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newFamily,  setNewFamily]  = useState('')
  const [uploading,  setUploading]  = useState(false)
  const [docType,    setDocType]    = useState('other')

  const role = profile?.role ?? ''
  const canEditDetails = ['admin', 'super_admin', 'teacher'].includes(role)
  const canWrite       = STAFF_ROLES.includes(role) // notes + documents
  const isAdmin        = ['admin', 'super_admin'].includes(role)

  useEffect(() => {
    if (!profile) return
    if (!STAFF_ROLES.includes(profile.role)) { router.replace('/dashboard'); return }
    load()
  }, [profile])

  async function load() {
    // Separate queries throughout — nested joins silently fail under RLS here.
    const { data: stud } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, tenant_id, role, is_active')
      .eq('id', studentId)
      .maybeSingle()
    if (!stud || stud.role !== 'student') { setStudent(null); setLoading(false); return }
    setStudent(stud)

    const [{ data: det }, { data: fams }, { data: links }, { data: examScores },
           { data: noteRows }, { data: docRows }] = await Promise.all([
      supabase.from('student_details').select('*').eq('student_id', studentId).maybeSingle(),
      supabase.from('families').select('id, label').eq('tenant_id', stud.tenant_id).order('label'),
      supabase.from('class_students').select('class_id').eq('student_id', studentId),
      supabase.from('exam_scores').select('class_id, semester, score, max_score').eq('student_id', studentId),
      supabase.from('student_notes').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase.from('student_documents').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    ])

    if (det) {
      setForm({
        date_of_birth: det.date_of_birth ?? '',
        gender: det.gender ?? '',
        address: det.address ?? '',
        parent_email: det.parent_email ?? '',
        parent_phone: det.parent_phone ?? '',
        emergency_contact_name: det.emergency_contact_name ?? '',
        emergency_contact_phone: det.emergency_contact_phone ?? '',
        family_id: det.family_id ?? '',
      })
    }
    setFamilies(fams ?? [])

    const classIds = (links ?? []).map((l: any) => l.class_id)
    const { data: classRows } = classIds.length
      ? await supabase.from('classes').select('id, name, color').in('id', classIds).order('name')
      : { data: [] }
    setClasses(classRows ?? [])
    setScores(examScores ?? [])

    // Author names for notes (separate query — same RLS gotcha)
    const authorIds = Array.from(new Set((noteRows ?? []).map((n: any) => n.author_id)))
    const { data: authors } = authorIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name').in('id', authorIds)
      : { data: [] }
    const authorMap = Object.fromEntries((authors ?? []).map((a: any) => [a.id, `${a.first_name} ${a.last_name}`]))
    setNotes((noteRows ?? []).map((n: any) => ({ ...n, author_name: authorMap[n.author_id] ?? '—' })))

    setDocuments(docRows ?? [])
    setLoading(false)
  }

  async function saveDetails() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('student_details').upsert({
      student_id: studentId,
      tenant_id: student.tenant_id,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      address: form.address.trim() || null,
      parent_email: form.parent_email.trim() || null,
      parent_phone: form.parent_phone.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      family_id: form.family_id || null,
    })
    if (err) setError('Opslaan mislukt.')
    else setEditing(false)
    setSaving(false)
  }

  async function createFamily() {
    if (!newFamily.trim()) return
    const { data, error: err } = await supabase
      .from('families')
      .insert({ tenant_id: student.tenant_id, label: newFamily.trim() })
      .select('id, label')
      .single()
    if (!err && data) {
      setFamilies(prev => [...prev, data].sort((a, b) => a.label.localeCompare(b.label)))
      setForm(p => ({ ...p, family_id: data.id }))
      setNewFamily('')
    }
  }

  async function addNote() {
    if (!newNote.trim()) return
    setAddingNote(true)
    const { error: err } = await supabase.from('student_notes').insert({
      tenant_id: student.tenant_id,
      student_id: studentId,
      author_id: profile!.id,
      body: newNote.trim(),
    })
    if (!err) {
      setNewNote('')
      const { data: noteRows } = await supabase
        .from('student_notes').select('*').eq('student_id', studentId)
        .order('created_at', { ascending: false })
      setNotes((noteRows ?? []).map((n: any) => ({
        ...n,
        author_name: n.author_id === profile!.id
          ? `${profile!.first_name} ${profile!.last_name}`
          : (notes.find(x => x.author_id === n.author_id)?.author_name ?? '—'),
      })))
    }
    setAddingNote(false)
  }

  async function deleteNote(id: string) {
    await supabase.from('student_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOC_SIZE) { setError('Bestand te groot (max 10 MB).'); return }
    setUploading(true)
    setError('')
    const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `${student.tenant_id}/${studentId}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('student-documents').upload(path, file)
    if (upErr) { setError('Upload mislukt.'); setUploading(false); return }
    const { error: insErr } = await supabase.from('student_documents').insert({
      tenant_id: student.tenant_id,
      student_id: studentId,
      doc_type: docType,
      file_name: file.name,
      file_url: path,
      uploaded_by: profile!.id,
    })
    if (insErr) {
      await supabase.storage.from('student-documents').remove([path])
      setError('Opslaan van document mislukt.')
    } else {
      const { data: docRows } = await supabase
        .from('student_documents').select('*').eq('student_id', studentId)
        .order('created_at', { ascending: false })
      setDocuments(docRows ?? [])
    }
    setUploading(false)
  }

  async function deleteDocument(doc: any) {
    if (!confirm(`Document "${doc.file_name}" verwijderen?`)) return
    await supabase.storage.from('student-documents').remove([doc.file_url])
    await supabase.from('student_documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  if (profileLoading || loading) return <PageLoader />
  if (!profile || !STAFF_ROLES.includes(profile.role)) return null

  if (!student) {
    return (
      <div className="animate-slide-up max-w-3xl">
        <button onClick={() => router.push('/dossiers')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={15} /> Terug
        </button>
        <div className="card p-8 text-center text-gray-400 text-sm">Leerling niet gevonden of geen toegang.</div>
      </div>
    )
  }

  const familyLabel = families.find(f => f.id === form.family_id)?.label
  const classMap = Object.fromEntries(classes.map((c: any) => [c.id, c]))

  return (
    <div className="animate-slide-up max-w-3xl">
      <button onClick={() => router.push('/dossiers')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={15} /> Dossiers
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold flex-shrink-0">
          {student.first_name?.[0]}{student.last_name?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-lg text-gray-900">{student.first_name} {student.last_name}</h1>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {student.email && (
              <a href={`mailto:${student.email}`} className="flex items-center gap-1 hover:text-primary-600 transition-colors">
                <Mail size={11} /> {student.email}
              </a>
            )}
            {!student.is_active && <span className="text-red-400">Gearchiveerd</span>}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">{error}</div>
      )}

      <div className="space-y-5">

        {/* ── Contact info ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users size={16} className="text-primary-600" /> Contactgegevens
            </h2>
            {canEditDetails && !editing && (
              <button onClick={() => setEditing(true)} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium">
                <Pencil size={12} /> Bewerken
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Geboortedatum</label>
                  <input type="date" value={form.date_of_birth}
                    onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Geslacht</label>
                  <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} className="input">
                    <option value="">—</option>
                    <option value="m">Jongen</option>
                    <option value="f">Meisje</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Adres</label>
                <input type="text" value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="input" placeholder="Straat 1, 2100 Deurne" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">E-mail ouder</label>
                  <input type="email" value={form.parent_email}
                    onChange={e => setForm(p => ({ ...p, parent_email: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Telefoon ouder</label>
                  <input type="tel" value={form.parent_phone}
                    onChange={e => setForm(p => ({ ...p, parent_phone: e.target.value }))} className="input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Noodcontact — naam</label>
                  <input type="text" value={form.emergency_contact_name}
                    onChange={e => setForm(p => ({ ...p, emergency_contact_name: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Noodcontact — telefoon</label>
                  <input type="tel" value={form.emergency_contact_phone}
                    onChange={e => setForm(p => ({ ...p, emergency_contact_phone: e.target.value }))} className="input" />
                </div>
              </div>

              {/* Family — admin assigns */}
              {isAdmin && (
                <div>
                  <label className="label">Familie (voor Chart-bijdrage)</label>
                  <div className="flex gap-2">
                    <select value={form.family_id}
                      onChange={e => setForm(p => ({ ...p, family_id: e.target.value }))} className="input flex-1">
                      <option value="">Geen familie</option>
                      {families.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input type="text" value={newFamily} onChange={e => setNewFamily(e.target.value)}
                      placeholder="Nieuwe familie (bv. achternaam)…" className="input flex-1 text-sm" />
                    <button onClick={createFamily} disabled={!newFamily.trim()}
                      className="btn-secondary text-xs px-3 flex items-center gap-1">
                      <Plus size={12} /> Aanmaken
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={saveDetails} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Opslaan
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-sm flex items-center gap-1.5">
                  <X size={13} /> Annuleren
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              {[
                ['Geboortedatum', form.date_of_birth ? format(new Date(form.date_of_birth), 'd MMMM yyyy', { locale: nl }) : null],
                ['Geslacht', form.gender === 'm' ? 'Jongen' : form.gender === 'f' ? 'Meisje' : null],
                ['Adres', form.address || null],
                ['E-mail ouder', form.parent_email || null],
                ['Telefoon ouder', form.parent_phone || null],
                ['Noodcontact', form.emergency_contact_name
                  ? `${form.emergency_contact_name}${form.emergency_contact_phone ? ` (${form.emergency_contact_phone})` : ''}`
                  : null],
                ['Familie', familyLabel ?? null],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-gray-400">{label}</dt>
                  <dd className="text-gray-800">
                    {label === 'E-mail ouder' && value
                      ? <a href={`mailto:${value}`} className="hover:text-primary-600 transition-colors">{value}</a>
                      : (value ?? <span className="text-gray-300">—</span>)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* ── Classes + exam scores ── */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <GraduationCap size={16} className="text-primary-600" /> Klassen & examenresultaten
          </h2>
          {classes.length === 0 ? (
            <p className="text-sm text-gray-400">Niet ingeschreven in een klas.</p>
          ) : (
            <div className="space-y-2">
              {classes.map((c: any) => {
                const s1 = scores.find((s: any) => s.class_id === c.id && s.semester === 1)
                const s2 = scores.find((s: any) => s.class_id === c.id && s.semester === 2)
                const fmt = (s: any) => s ? `${s.score}/${s.max_score}` : '—'
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: c.color }}>
                      {c.name[0]}
                    </div>
                    <span className="flex-1 text-sm font-medium text-gray-800">{c.name}</span>
                    <span className="text-xs text-gray-500">S1: <span className="font-medium text-gray-700">{fmt(s1)}</span></span>
                    <span className="text-xs text-gray-500">S2: <span className="font-medium text-gray-700">{fmt(s2)}</span></span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <MessageSquare size={16} className="text-primary-600" /> Notities
            <span className="text-xs font-normal text-gray-400">(niet zichtbaar voor de leerling)</span>
          </h2>
          {canWrite && (
            <div className="flex gap-2 mb-4">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Notitie over gedrag, afspraken, opvolging…"
                rows={2}
                className="input flex-1 resize-none text-sm"
              />
              <button onClick={addNote} disabled={addingNote || !newNote.trim()}
                className="btn-primary text-xs px-3 self-end flex items-center gap-1">
                {addingNote ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Toevoegen
              </button>
            </div>
          )}
          {notes.length === 0 ? (
            <p className="text-sm text-gray-400">Nog geen notities.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n: any) => (
                <div key={n.id} className="rounded-xl border border-border p-3.5 group">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-600">{n.author_name}</span>
                    <span className="text-xs text-gray-300">
                      {format(new Date(n.created_at), 'd MMM yyyy HH:mm', { locale: nl })}
                    </span>
                    {(n.author_id === profile.id || isAdmin) && (
                      <button onClick={() => deleteNote(n.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                        title="Verwijderen">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Documents ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileText size={16} className="text-primary-600" /> Documenten
            </h2>
            {canWrite && (
              <div className="flex items-center gap-2">
                <select value={docType} onChange={e => setDocType(e.target.value)} className="input text-xs py-1.5 w-auto">
                  {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className={`btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">Nog geen documenten.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d: any) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-border group">
                  <SignedFileLink bucket="student-documents" path={d.file_url}
                    className="flex items-center gap-3 flex-1 min-w-0 hover:text-primary-700 transition-colors">
                    <FileText size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800 truncate">{d.file_name}</span>
                  </SignedFileLink>
                  <span className="badge bg-gray-100 text-gray-500 flex-shrink-0">{DOC_TYPES[d.doc_type] ?? d.doc_type}</span>
                  <span className="text-xs text-gray-300 flex-shrink-0">
                    {format(new Date(d.created_at), 'd MMM yyyy', { locale: nl })}
                  </span>
                  {(d.uploaded_by === profile.id || isAdmin) && (
                    <button onClick={() => deleteDocument(d)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                      title="Verwijderen">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
