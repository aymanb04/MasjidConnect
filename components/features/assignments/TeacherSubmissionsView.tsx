'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { CheckCircle2, Download, MessageSquare, Star, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { formatFileSize, getFileIcon, formatDateTime, cn } from '@/lib/utils'
import { SignedFileLink } from '@/components/SignedFileLink'

export interface RosterEntry {
  student_id: string
  first_name: string
  last_name: string
  /** The pupil's own task for a per-pupil assignment, e.g. "Surah al Qiyamah". */
  task_text: string | null
  /** null when the pupil handed in nothing. Gradeable all the same. */
  submission: any | null
}

interface Props {
  roster: RosterEntry[]
  studentCount: number
  assignmentId: string
  maxScore?: number
  /** Re-runs the parent's client-side loader. router.refresh() cannot: the
   *  detail page fetches in a useEffect, not in a server component. */
  onGraded?: () => void
}

// This list is built from the CLASS ROSTER, not from the submissions. A teacher
// who hears every pupil recite a surah in class gets no uploads at all, so an
// inbox of submissions showed him an empty page and no way to award a mark.
// Every pupil therefore appears, with their own task beside their name, whether
// or not they handed anything in.
export default function TeacherSubmissionsView({ roster, studentCount, assignmentId, maxScore, onGraded }: Props) {
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, { score: string; comment: string }>>({})
  const [saving, setSaving]       = useState<string | null>(null)
  const [saved, setSaved]         = useState<Set<string>>(new Set())
  const [error, setError]         = useState('')

  const handedIn = roster.filter(r => r.submission && r.submission.status !== 'draft')
  const graded   = roster.filter(r => r.submission?.submission_feedback?.[0]?.score != null)
  const anyTasks = roster.some(r => r.task_text)

  const getFb = (id: string) => feedbacks[id] ?? { score: '', comment: '' }

  async function saveFeedback(entry: RosterEntry) {
    const fb = getFb(entry.student_id)
    setSaving(entry.student_id)
    setError('')
    try {
      const uid = (await supabase.auth.getUser()).data.user!.id
      let submissionId: string | undefined = entry.submission?.id

      // No submission row yet -- the pupil recited instead of uploading. Create
      // one so the mark has somewhere to live and flows on into the puntenlijst,
      // the weighted average and the rapport like any other homework score.
      // Migration 35 is what lets a teacher do this.
      if (!submissionId) {
        const { data: created, error: insErr } = await supabase
          .from('submissions')
          .upsert({ assignment_id: assignmentId, student_id: entry.student_id, status: 'graded' },
                  { onConflict: 'assignment_id,student_id' })
          .select('id')
          .single()
        if (insErr) throw insErr
        submissionId = created.id
      }

      const { error: fbErr } = await supabase.from('submission_feedback').upsert({
        ...(entry.submission?.submission_feedback?.[0]?.id
          ? { id: entry.submission.submission_feedback[0].id } : {}),
        submission_id: submissionId,
        teacher_id: uid,
        score: fb.score !== '' ? parseInt(fb.score) : null,
        comment: fb.comment || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'submission_id' })
      if (fbErr) throw fbErr

      // Was ignored once: the feedback saved but the submission stayed
      // "submitted", so the teacher saw it as ungraded and the pupil never got
      // the badge.
      const { error: statusErr } = await supabase
        .from('submissions').update({ status: 'graded' }).eq('id', submissionId)
      if (statusErr) throw statusErr

      setSaved(prev => new Set(prev).add(entry.student_id))
      onGraded?.()
    } catch (e: any) {
      // e.message is the raw English Postgres string; keep it in the console.
      console.error(e)
      setError('Opslaan mislukt. Probeer het opnieuw.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-6 mb-5 pb-5 border-b border-border">
        <div className="text-center">
          <div className="text-2xl font-semibold text-primary-600">{graded.length}</div>
          <div className="text-xs text-gray-500">Beoordeeld</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-amber-500">{Math.max(0, roster.length - graded.length)}</div>
          <div className="text-xs text-gray-500">Nog te beoordelen</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-900">{handedIn.length}</div>
          <div className="text-xs text-gray-500">Ingediend</div>
        </div>
        <div className="flex-1 ml-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Beoordeeld</span>
            <span>{roster.length > 0 ? Math.round((graded.length / roster.length) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-500 h-2 rounded-full transition-all"
              style={{ width: roster.length > 0 ? `${(graded.length / roster.length) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-gray-900 mb-1">Leerlingen ({roster.length})</h2>
      <p className="text-xs text-gray-500 mb-4">
        {anyTasks
          ? 'Klik op een leerling om zijn opdracht te zien en punten te geven.'
          : 'Klik op een leerling om punten te geven. Dat kan ook als hij niets heeft ingediend.'}
      </p>

      {error && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
      )}

      {roster.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Geen leerlingen in deze klas.</p>
      ) : (
        <div className="space-y-2">
          {roster.map(entry => {
            const sub     = entry.submission
            const isOpen  = expanded === entry.student_id
            const hasFb   = sub?.submission_feedback?.[0]
            const isSaved = saved.has(entry.student_id)
            const didHand = sub && sub.status !== 'draft'

            return (
              <div key={entry.student_id} className="border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : entry.student_id)}
                >
                  <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {entry.first_name?.[0]}{entry.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800">
                      {entry.first_name} {entry.last_name}
                    </div>
                    {/* The task on the collapsed row too: a teacher going down
                        the class one by one should not have to open each pupil. */}
                    {entry.task_text
                      ? <div className="text-xs text-gray-600 truncate">{entry.task_text}</div>
                      : <div className="text-xs text-gray-400">
                          {didHand ? formatDateTime(sub.submitted_at) : 'Niets ingediend'}
                        </div>}
                  </div>
                  {didHand
                    ? <span className="badge bg-blue-50 text-blue-700">Ingediend</span>
                    : <span className="badge bg-gray-100 text-gray-500">Niets ingediend</span>}
                  {hasFb?.score != null && (
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                      {hasFb.score}{maxScore ? `/${maxScore}` : ''} pt
                    </span>
                  )}
                  {isOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border bg-gray-50/50">
                    {entry.task_text && (
                      <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                          Opdracht van deze leerling
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                          {entry.task_text}
                        </p>
                      </div>
                    )}

                    {sub?.text_content && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Ingediende tekst</p>
                        <div className="p-3.5 bg-white border border-border rounded-xl text-sm text-gray-700 whitespace-pre-wrap">
                          {sub.text_content}
                        </div>
                      </div>
                    )}

                    {sub?.submission_files?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Bestanden ({sub.submission_files.length})</p>
                        <div className="space-y-2">
                          {sub.submission_files.map((f: any) => (
                            <SignedFileLink key={f.id} bucket="submission-files" path={f.file_url}
                              className="flex items-center gap-3 p-3 bg-white border border-border rounded-xl hover:border-primary-200 transition-colors group">
                              <span className="text-base">{getFileIcon(f.file_type)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{f.file_name}</div>
                                {f.file_size && <div className="text-xs text-gray-400">{formatFileSize(f.file_size)}</div>}
                              </div>
                              <Download size={14} className="text-primary-600 group-hover:text-primary-700" />
                            </SignedFileLink>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-4 bg-white border border-border rounded-xl">
                      <p className="text-xs font-medium text-gray-700 mb-3 flex items-center gap-1.5">
                        <MessageSquare size={13} /> Punten en feedback
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
                            value={feedbacks[entry.student_id]?.score !== undefined
                              ? feedbacks[entry.student_id].score
                              : String(hasFb?.score ?? '')}
                            onChange={e => setFeedbacks(prev => ({
                              ...prev, [entry.student_id]: { ...getFb(entry.student_id), score: e.target.value } }))}
                            placeholder="0"
                            className="input"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="label text-xs">Commentaar</label>
                          <textarea
                            rows={2}
                            value={feedbacks[entry.student_id]?.comment !== undefined
                              ? feedbacks[entry.student_id].comment
                              : (hasFb?.comment ?? '')}
                            onChange={e => setFeedbacks(prev => ({
                              ...prev, [entry.student_id]: { ...getFb(entry.student_id), comment: e.target.value } }))}
                            placeholder="Optioneel commentaar voor de leerling…"
                            className="input resize-none"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => saveFeedback(entry)}
                        disabled={saving === entry.student_id}
                        className={cn('btn-primary text-xs py-2 px-4', isSaved && 'bg-green-600 hover:bg-green-700')}
                      >
                        {saving === entry.student_id
                          ? <><Loader2 size={13} className="animate-spin" /> Opslaan…</>
                          : isSaved
                            ? <><CheckCircle2 size={13} /> Opgeslagen!</>
                            : <><Star size={13} /> Punten opslaan</>
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
