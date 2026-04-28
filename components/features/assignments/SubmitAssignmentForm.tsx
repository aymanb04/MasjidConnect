'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, Loader2, FileText, RotateCcw } from 'lucide-react'
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
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export default function SubmitAssignmentForm({ assignmentId, assignment, existingSubmission, userId }: Props) {
  const [text, setText]         = useState(existingSubmission?.text_content ?? '')
  const [files, setFiles]       = useState<File[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router  = useRouter()
  const supabase = createClient()

  const sub = existingSubmission
  const sb  = sub ? getSubmissionStatusBadge(sub.status) : null
  const alreadySubmitted = !!sub

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
      // Upsert submission
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

      // Upload bestanden
      for (const file of files) {
        const path = `${userId}/${assignmentId}/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage
          .from('submission-files')
          .upload(path, file)
        if (upErr) throw upErr

        const { data: { publicUrl } } = supabase.storage
          .from('submission-files')
          .getPublicUrl(path)

        await supabase.from('submission_files').insert({
          submission_id: submission.id,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          file_type: file.type,
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

      {/* Bestaande feedback */}
      {sub?.submission_feedback?.[0] && (
        <div className="mb-5 p-4 bg-primary-50 border border-primary-200 rounded-xl">
          <div className="text-xs font-medium text-primary-700 mb-1">
            Feedback van {sub.submission_feedback[0].profiles?.first_name}
            {sub.submission_feedback[0].score != null && (
              <span className="ml-2 bg-primary-200 text-primary-800 px-2 py-0.5 rounded-full">
                {sub.submission_feedback[0].score}/{assignment.max_score ?? '?'} punten
              </span>
            )}
          </div>
          <p className="text-sm text-primary-800">{sub.submission_feedback[0].comment}</p>
        </div>
      )}

      {/* Bestaande bestanden */}
      {sub?.submission_files?.length > 0 && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 font-medium mb-2">Eerder ingediende bestanden</p>
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

      {/* Bestaande tekst */}
      {sub?.text_content && (
        <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-border">
          <p className="text-xs text-gray-500 font-medium mb-1">Ingediende tekst</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{sub.text_content}</p>
        </div>
      )}

      {/* Tekst invoer */}
      {assignment.allow_text_submission && (
        <div className="mb-4">
          <label className="label">Antwoord typen</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder="Typ hier je antwoord…"
            className="input resize-none"
          />
        </div>
      )}

      {/* Bestand uploaden */}
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
            <Upload size={22} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 font-medium">Sleep een bestand hierheen of klik om te bladeren</p>
            <p className="text-xs text-gray-400 mt-1">PDF, Word, afbeeldingen — max 20 MB</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={e => handleFileAdd(e.target.files)}
            />
          </div>

          {/* Geselecteerde bestanden */}
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
                    className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} /> Taak succesvol ingediend!
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="btn-primary w-full justify-center h-11"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Bezig met indienen…</>
          : alreadySubmitted
            ? <><RotateCcw size={16} /> Opnieuw indienen</>
            : <><CheckCircle2 size={16} /> Taak indienen</>
        }
      </button>
      {alreadySubmitted && (
        <p className="text-xs text-center text-gray-400 mt-2">Je kan je indiening opnieuw uploaden tot de deadline.</p>
      )}
    </div>
  )
}
