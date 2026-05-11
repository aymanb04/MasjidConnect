'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Download, MessageSquare, Star, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { formatFileSize, getFileIcon, getSubmissionStatusBadge, formatDateTime, cn } from '@/lib/utils'

interface Props {
  submissions: any[]
  studentCount: number
  assignmentId: string
  maxScore?: number
}

export default function TeacherSubmissionsView({ submissions, studentCount, assignmentId, maxScore }: Props) {
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, { score: string; comment: string }>>({})
  const [saving, setSaving]       = useState<string | null>(null)
  const [saved, setSaved]         = useState<Set<string>>(new Set())
  const router = useRouter()

  const submitted = submissions.filter(s => s.status !== 'draft')
  const notSubmitted = studentCount - submitted.length

  function getFb(subId: string) {
    return feedbacks[subId] ?? { score: '', comment: '' }
  }

  async function saveFeedback(sub: any) {
    const fb = getFb(sub.id)
    setSaving(sub.id)
    try {
      await supabase.from('submission_feedback').upsert({
        ...(sub.submission_feedback?.[0]?.id ? { id: sub.submission_feedback[0].id } : {}),
        submission_id: sub.id,
        teacher_id: (await supabase.auth.getUser()).data.user!.id,
        score: fb.score ? parseInt(fb.score) : null,
        comment: fb.comment || null,
      }, { onConflict: 'submission_id,teacher_id' })

      await supabase.from('submissions').update({ status: 'graded' }).eq('id', sub.id)

      setSaved(prev => new Set(prev).add(sub.id))
      router.refresh()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="card p-6">
      {/* Stats */}
      <div className="flex items-center gap-6 mb-5 pb-5 border-b border-border">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-900">{submitted.length}</div>
          <div className="text-xs text-gray-500">Ingediend</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-amber-500">{notSubmitted > 0 ? notSubmitted : 0}</div>
          <div className="text-xs text-gray-500">Nog niet ingediend</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-primary-600">{submissions.filter(s => s.status === 'graded').length}</div>
          <div className="text-xs text-gray-500">Beoordeeld</div>
        </div>

        {/* Progress bar */}
        <div className="flex-1 ml-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Indieningen</span>
            <span>{studentCount > 0 ? Math.round((submitted.length / studentCount) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-500 h-2 rounded-full transition-all"
              style={{ width: studentCount > 0 ? `${(submitted.length / studentCount) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-gray-900 mb-4">Indieningen ({submitted.length})</h2>

      {submitted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nog geen indieningen ontvangen.</p>
      ) : (
        <div className="space-y-2">
          {submitted.map((sub: any) => {
            const sb      = getSubmissionStatusBadge(sub.status)
            const isOpen  = expanded === sub.id
            const fb      = getFb(sub.id)
            const hasFb   = sub.submission_feedback?.[0]
            const isSaved = saved.has(sub.id)

            return (
              <div key={sub.id} className="border border-border rounded-xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : sub.id)}
                >
                  <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {sub.profiles?.first_name?.[0]}{sub.profiles?.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800">
                      {sub.profiles?.first_name} {sub.profiles?.last_name}
                    </div>
                    <div className="text-xs text-gray-400">{formatDateTime(sub.submitted_at)}</div>
                  </div>
                  <span className={`badge ${sb.color}`}>{sb.label}</span>
                  {hasFb?.score != null && (
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                      {hasFb.score}{maxScore ? `/${maxScore}` : ''} pt
                    </span>
                  )}
                  {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border bg-gray-50/50">

                    {/* Tekst */}
                    {sub.text_content && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Ingediende tekst</p>
                        <div className="p-3.5 bg-white border border-border rounded-xl text-sm text-gray-700 whitespace-pre-wrap">
                          {sub.text_content}
                        </div>
                      </div>
                    )}

                    {/* Bestanden */}
                    {sub.submission_files?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Bestanden ({sub.submission_files.length})</p>
                        <div className="space-y-2">
                          {sub.submission_files.map((f: any) => (
                            <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 bg-white border border-border rounded-xl hover:border-primary-200 transition-colors group">
                              <span className="text-base">{getFileIcon(f.file_type)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{f.file_name}</div>
                                {f.file_size && <div className="text-xs text-gray-400">{formatFileSize(f.file_size)}</div>}
                              </div>
                              <Download size={14} className="text-primary-600 group-hover:text-primary-700" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feedback geven */}
                    <div className="mt-4 p-4 bg-white border border-border rounded-xl">
                      <p className="text-xs font-medium text-gray-700 mb-3 flex items-center gap-1.5">
                        <MessageSquare size={13} /> Feedback geven
                      </p>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="col-span-1">
                          <label className="label text-xs">
                            {maxScore ? `Punten (max ${maxScore})` : 'Punten'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={maxScore ?? undefined}
                            value={fb.score !== undefined ? fb.score : (hasFb?.score ?? '')}
                            onChange={e => setFeedbacks(prev => ({ ...prev, [sub.id]: { ...getFb(sub.id), score: e.target.value } }))}
                            placeholder="0"
                            className="input"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="label text-xs">Commentaar</label>
                          <textarea
                            rows={2}
                            value={fb.comment !== undefined ? fb.comment : (hasFb?.comment ?? '')}
                            onChange={e => setFeedbacks(prev => ({ ...prev, [sub.id]: { ...getFb(sub.id), comment: e.target.value } }))}
                            placeholder="Optioneel commentaar voor de leerling…"
                            className="input resize-none"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => saveFeedback(sub)}
                        disabled={saving === sub.id}
                        className={cn('btn-primary text-xs py-2 px-4', isSaved && 'bg-green-600 hover:bg-green-700')}
                      >
                        {saving === sub.id
                          ? <><Loader2 size={13} className="animate-spin" /> Opslaan…</>
                          : isSaved
                            ? <><CheckCircle2 size={13} /> Opgeslagen!</>
                            : <><Star size={13} /> Feedback opslaan</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
