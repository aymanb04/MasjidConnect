'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { formatFileSize } from '@/lib/utils'
import {
  ArrowLeft, FileText, Upload, Trash2, Loader2,
  Download, CheckCircle2, AlertCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportSlot {
  semester: 1 | 2
  report: {
    id: string
    file_name: string
    file_url: string
    file_size?: number
    uploaded_by: string
    created_at: string
  } | null
}

interface StudentRow {
  id: string
  first_name: string
  last_name: string
  slots: ReportSlot[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function storagePath(tenantId: string, studentId: string, classId: string, semester: number, fileName: string) {
  const ext = fileName.split('.').pop() ?? 'pdf'
  // Fixed path per slot — uploading to same path overwrites the old file automatically
  return `${tenantId}/${studentId}/${classId}_s${semester}.${ext}`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RapportenPage() {
  const { klasId } = useParams<{ klasId: string }>()
  const { profile, loading: profileLoading } = useProfile()

  const [klas,        setKlas]        = useState<any>(null)
  const [students,    setStudents]    = useState<StudentRow[]>([])
  const [mySlots,     setMySlots]     = useState<ReportSlot[]>([]) // student self-view
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState<string | null>(null)  // `${studentId}_${semester}`
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [flashDone,   setFlashDone]   = useState<string | null>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<{ studentId: string; semester: 1 | 2 } | null>(null)

  const isTeacherOrAdmin = profile && ['teacher', 'admin', 'super_admin'].includes(profile.role)

  useEffect(() => {
    if (profile && klasId) loadData()
  }, [profile, klasId])

  // ── Load class + reports ──────────────────────────────────────────────────

  async function loadData() {
    // 1. Class info
    const { data: k } = await supabase
      .from('classes')
      .select('*, school_years(id, name), groups(name)')
      .eq('id', klasId)
      .single()
    setKlas(k)

    if (!k) { setLoading(false); return }

    if (isTeacherOrAdmin) {
      await loadTeacherView(k.school_years?.id)
    } else {
      await loadStudentView(k.school_years?.id)
    }
    setLoading(false)
  }

  async function loadTeacherView(schoolYearId: string) {
    // All enrolled students
    const { data: links } = await supabase
      .from('class_students')
      .select('profiles(id, first_name, last_name)')
      .eq('class_id', klasId)
    const studs = (links ?? []).map((l: any) => l.profiles).filter(Boolean)

    // All reports for this class + year
    const { data: reports } = await supabase
      .from('student_reports')
      .select('*')
      .eq('class_id', klasId)
      .eq('school_year_id', schoolYearId)

    const rMap: Record<string, Record<number, any>> = {}
    for (const r of (reports ?? [])) {
      if (!rMap[r.student_id]) rMap[r.student_id] = {}
      rMap[r.student_id][r.semester] = r
    }

    setStudents(
      studs.map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        slots: [1, 2].map(sem => ({
          semester: sem as 1 | 2,
          report: rMap[s.id]?.[sem] ?? null,
        })),
      }))
    )
  }

  async function loadStudentView(schoolYearId: string) {
    const { data: reports } = await supabase
      .from('student_reports')
      .select('*')
      .eq('class_id', klasId)
      .eq('school_year_id', schoolYearId)
      .eq('student_id', profile!.id)

    const rMap: Record<number, any> = {}
    for (const r of (reports ?? [])) rMap[r.semester] = r

    setMySlots([1, 2].map(sem => ({
      semester: sem as 1 | 2,
      report: rMap[sem] ?? null,
    })))
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  function triggerUpload(studentId: string, semester: 1 | 2) {
    pendingUpload.current = { studentId, semester }
    fileInputRef.current?.click()
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''               // reset so same file can be re-selected
    if (!file || !pendingUpload.current || !klas) return

    const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
    if (file.size > MAX_SIZE) {
      alert('Bestand te groot. Maximum bestandsgrootte is 10 MB.')
      return
    }

    const { studentId, semester } = pendingUpload.current
    const key = `${studentId}_${semester}`
    setUploading(key)

    try {
      const path = storagePath(
        profile!.tenant_id!,
        studentId,
        klasId,
        semester,
        file.name,
      )

      // Upload (overwrites any existing file at the same path)
      const { error: uploadErr } = await supabase.storage
        .from('student-reports')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadErr) throw new Error(uploadErr.message)

      // Upsert DB record — unique on (student_id, class_id, school_year_id, semester)
      const { error: dbErr } = await supabase
        .from('student_reports')
        .upsert({
          tenant_id:      profile!.tenant_id,
          student_id:     studentId,
          class_id:       klasId,
          school_year_id: klas.school_years?.id,
          uploaded_by:    profile!.id,
          semester,
          file_name:      file.name,
          file_url:       path,
          file_size:      file.size,
          file_type:      file.type,
        }, {
          onConflict: 'student_id,class_id,school_year_id,semester',
        })

      if (dbErr) throw new Error(dbErr.message)

      setFlashDone(key)
      setTimeout(() => setFlashDone(null), 2500)
      await loadData()
    } catch (err: any) {
      alert('Upload mislukt: ' + err.message)
    } finally {
      setUploading(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(report: NonNullable<ReportSlot['report']>) {
    if (!window.confirm(`Rapport "${report.file_name}" verwijderen?`)) return
    setDeleting(report.id)

    // Delete from storage
    await supabase.storage.from('student-reports').remove([report.file_url])

    // Delete DB record
    await supabase.from('student_reports').delete().eq('id', report.id)

    setDeleting(null)
    await loadData()
  }

  // ── Download via signed URL ───────────────────────────────────────────────

  async function handleDownload(fileUrl: string, fileName: string) {
    const { data, error } = await supabase.storage
      .from('student-reports')
      .createSignedUrl(fileUrl, 60)
    if (error || !data?.signedUrl) { alert('Download mislukt.'); return }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = fileName
    a.click()
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (profileLoading || loading) return <PageLoader />
  if (!klas) return <div className="p-8 text-sm text-gray-400">Klas niet gevonden.</div>

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="animate-slide-up max-w-3xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChosen}
      />

      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/klassen/${klasId}`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft size={15} /> Terug naar {klas.name}
        </Link>
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
            style={{ backgroundColor: klas.color }}
          >
            <FileText size={22} />
          </div>
          <div>
            <h1 className="page-title">Rapporten — {klas.name}</h1>
            <p className="page-subtitle">
              {[klas.groups?.name, klas.school_years?.name].filter(Boolean).join(' · ')}
              {isTeacherOrAdmin ? ' · Uploaden en beheren van rapporten per leerling' : ' · Jouw rapporten'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Teacher / admin view ── */}
      {isTeacherOrAdmin && (
        <div className="card p-6">
          {students.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Geen leerlingen ingeschreven in deze klas.
            </p>
          ) : (
            <div className="space-y-4">
              {students.map(student => (
                <div key={student.id} className="rounded-xl border border-border p-4">
                  {/* Student name */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <span className="font-medium text-sm text-gray-900">
                      {student.first_name} {student.last_name}
                    </span>
                  </div>

                  {/* Semester slots */}
                  <div className="grid grid-cols-2 gap-3">
                    {student.slots.map(slot => {
                      const key = `${student.id}_${slot.semester}`
                      const isUploading = uploading === key
                      const isDone      = flashDone === key
                      const isDeleting  = deleting === slot.report?.id

                      return (
                        <div
                          key={slot.semester}
                          className={`rounded-lg border p-3 transition-colors ${
                            slot.report
                              ? 'border-primary-100 bg-primary-50/30'
                              : 'border-dashed border-gray-200 bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-600">
                              Semester {slot.semester}
                            </span>
                            {isDone && (
                              <CheckCircle2 size={14} className="text-primary-500" />
                            )}
                          </div>

                          {slot.report ? (
                            <div className="space-y-1.5">
                              <p
                                className="text-xs text-gray-700 truncate font-medium"
                                title={slot.report.file_name}
                              >
                                📄 {slot.report.file_name}
                              </p>
                              {slot.report.file_size && (
                                <p className="text-xs text-gray-400">
                                  {formatFileSize(slot.report.file_size)}
                                </p>
                              )}
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  onClick={() => handleDownload(slot.report!.file_url, slot.report!.file_name)}
                                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-white transition-colors"
                                >
                                  <Download size={11} /> Bekijken
                                </button>
                                <button
                                  onClick={() => triggerUpload(student.id, slot.semester)}
                                  disabled={!!uploading}
                                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded-lg border border-primary-200 text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40"
                                >
                                  {isUploading
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <Upload size={11} />
                                  }
                                  Vervangen
                                </button>
                                <button
                                  onClick={() => handleDelete(slot.report!)}
                                  disabled={isDeleting}
                                  className="p-1 rounded-lg border border-gray-200 text-gray-300 hover:text-red-400 hover:border-red-100 transition-colors"
                                >
                                  {isDeleting
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <Trash2 size={11} />
                                  }
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => triggerUpload(student.id, slot.semester)}
                              disabled={!!uploading}
                              className="w-full flex items-center justify-center gap-1.5 text-xs py-2 text-primary-600 hover:text-primary-800 disabled:opacity-40 transition-colors"
                            >
                              {isUploading
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Upload size={12} />
                              }
                              {isUploading ? 'Uploaden…' : 'Rapport uploaden'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Student self-view ── */}
      {!isTeacherOrAdmin && (
        <div className="card p-6">
          <div className="grid grid-cols-2 gap-4">
            {mySlots.map(slot => (
              <div
                key={slot.semester}
                className={`rounded-xl border p-4 ${
                  slot.report
                    ? 'border-primary-100 bg-primary-50/30'
                    : 'border-dashed border-gray-200 bg-gray-50'
                }`}
              >
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Semester {slot.semester}
                </p>
                {slot.report ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 truncate" title={slot.report.file_name}>
                      📄 {slot.report.file_name}
                    </p>
                    <button
                      onClick={() => handleDownload(slot.report!.file_url, slot.report!.file_name)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                    >
                      <Download size={12} /> Downloaden
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 py-2 text-gray-400">
                    <AlertCircle size={20} />
                    <p className="text-xs">Nog niet beschikbaar</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
