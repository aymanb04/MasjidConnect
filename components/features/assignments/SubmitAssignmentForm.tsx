'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, Loader2, FileText, RotateCcw, Star, Clock } from 'lucide-react'
import { formatFileSize, getFileIcon, getSubmissionStatusBadge, cn } from '@/lib/utils'

interface Props {
  assignmentId: string
  assignment: any
  existingSubmission: any
  userId: string
}

const ALLOWED_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 20 * 1024 * 1024

export default function SubmitAssignmentForm({ assignmentId, assignment, existingSubmission, userId }: Props) {
  const [text, setText]         = useState(existingSubmission?.text_content ?? '')
  const [files, setFiles]       = useState<File[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router  = useRouter()

  const sub             = existingSubmission
  const sb              = sub ? getSubmissionStatusBadge(sub.status) : null
  const feedback        = sub?.submission_feedback?.[0]
  const isGraded        = sub?.status === 'graded'
  const isPastDeadline  = assignment.due_date ? new Date(assignment.due_date) < new Date() : false
  const canSubmit       = !isGraded && !isPastDeadline
  const scoreDisplay    = feedback?.score != null
    ? assignment.max_score
      ? `${feedback.score}/${assignment.max_score}`
      : `${feedback.score}`
    : null

  function handleFileAdd(incoming: FileList | null) {
    if (!incoming) return
    const valid = Array.from(incoming).filter(f => {
      if (!ALLOWED_TYPES.includes(f.type)) { setError(`Bestandstype niet toegestaan: ${f.name}`); return false }
      if (f.size > MAX_SIZE) { setError(`Bestand te groot (max 20 MB): ${f.name}`); return false }
      return true
    })
    setFiles(prev => [...prev, ...valid])
    setError('')
  }

  async function handleSubmit() {
    if (!text.trim() && files.length === 0 && !sub?.submission_files?.length) {
      setError('Voeg tekst of een bestand toe voor je indient.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data: submission, error: subErr } = await supabase
        .from('submissions')
        .upsert({
          ...(sub?.id ? { id: sub.id } : {}),
          assignment_id: assignmentId,
          student_id: userId,
          text_content: text || null,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        }, { onConflict: 'assignment_id,student_id' })
        .select()
        .single()
      if (subErr) throw subErr

      for (const file of files) {
        const path = `${userId}/${assignmentId}/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage.from('submission-files').upload(path, file)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('submission-files').getPublicUrl(path)
        await supabase.from('submission_files').insert({
          submission_id: submission.id,
          file_name: file.name, file_url: publicUrl,
          file_size: file.size, file_type: file.type,
        })
      }
      setSuccess(true)
      setFiles([])
      setTimeout(() => router.refresh(), 1000)
    } catch (e: any) {
      setError(e.message ?? 'Er liep iets mis. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900">Mijn indiening</h2>
        {sb && <span className={`badge ${sb.color}`}>{sb.label}</span>}
      </div>

      {/* Score + feedback — shown prominently when graded */}
      {isGraded && (
        <div className="mb-5 rounded-xl border border-primary-200 bg-primary-50 overflow-hidden">
          <div className="flex items-center gap-4 p-4 border-b border-primary-100">
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
              <Star size={18} className="text-white"/>
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium text-primary-600 mb-0.5">
                Beoordeeld door leerkracht
              </div>
              {scoreDisplay && (
                <div className="text-2xl font-bold text-primary-800 leading-none">
                  {scoreDisplay}
                  {assignment.max_score && <span className="text-sm font-normal text-primary-500 ml-1">punten</span>}
                </div>
              )}
              {!scoreDisplay && <div className="text-sm text-primary-700">Beoordeeld</div>}
            </div>
          </div>
          {feedback?.comment ? (
            <div className="p-4">
              <p className="text-xs font-medium text-primary-600 mb-1">Commentaar</p>
              <p className="text-sm text-primary-800 leading-relaxed">{feedback.comment}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Submitted but not yet graded */}
      {sub && !isGraded && (
        <div className="mb-5 flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
          <Clock size={15} className="text-amber-500 flex-shrink-0"/>
          <p className="text-sm text-amber-700">Ingediend — wacht op beoordeling van de leerkracht.</p>
        </div>
      )}

      {/* Existing files */}
      {sub?.submission_files?.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 font-medium mb-2">Ingediende bestanden</p>
          <div className="space-y-2">
            {sub.submission_files.map((f: any) => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-border hover:border-primary-200 transition-colors group">
                <span className="text-lg">{getFileIcon(f.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{f.file_name}</div>
                  {f.file_size && <div className="text-xs text-gray-400">{formatFileSize(f.file_size)}</div>}
                </div>
                <span className="text-xs text-primary-600 group-hover:underline">Bekijken</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Existing text */}
      {sub?.text_content && (
        <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-border">
          <p className="text-xs text-gray-500 font-medium mb-1">Ingediende tekst</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{sub.text_content}</p>
        </div>
      )}

      {/* Submission form — only if not graded and deadline not passed */}
      {canSubmit && (
        <>
          {assignment.allow_text_submission && (
            <div className="mb-4">
              <label className="label">Antwoord typen</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
                placeholder="Typ hier je antwoord…" className="input resize-none"/>
            </div>
          )}

          {assignment.allow_file_submission && (
            <div className="mb-4">
              <label className="label">Bestand uploaden</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFileAdd(e.dataTransfer.files) }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
                  dragging ? 'border-primary-400 bg-primary-50' : 'border-border hover:border-primary-300 hover:bg-gray-50'
                )}
              >
                <Upload size={22} className="mx-auto text-gray-400 mb-2"/>
                <p className="text-sm text-gray-600 font-medium">Sleep een bestand hierheen of klik om te bladeren</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Word, afbeeldingen — max 20 MB</p>
                <input ref={fileRef} type="file" multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="hidden" onChange={e => handleFileAdd(e.target.files)}/>
              </div>
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-lg">{getFileIcon(f.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                        <div className="text-xs text-gray-500">{formatFileSize(f.size)}</div>
                      </div>
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 transition-colors"><X size={15}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={16}/> Taak succesvol ingediend!
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full justify-center h-11">
            {loading
              ? <><Loader2 size={16} className="animate-spin"/> Bezig met indienen…</>
              : sub
                ? <><RotateCcw size={16}/> Opnieuw indienen</>
                : <><CheckCircle2 size={16}/> Taak indienen</>
            }
          </button>
          {sub && (
            <p className="text-xs text-center text-gray-400 mt-2">Je kan je indiening opnieuw uploaden tot de deadline.</p>
          )}
        </>
      )}

      {/* Deadline passed, not yet submitted */}
      {isPastDeadline && !sub && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200">
          <Clock size={15} className="text-red-400 flex-shrink-0"/>
          <p className="text-sm text-red-600">De deadline is verstreken. Je kan deze taak niet meer indienen.</p>
        </div>
      )}

      {/* Deadline passed after submission (not graded) */}
      {isPastDeadline && sub && !isGraded && (
        <p className="text-xs text-center text-gray-400 mt-3">De deadline is verstreken — je indiening wacht op beoordeling.</p>
      )}
    </div>
  )
}
