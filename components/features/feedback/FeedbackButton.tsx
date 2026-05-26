'use client'

import { useState } from 'react'
import { MessageSquare, X, Loader2, Bug, Lightbulb, HelpCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'

type FeedbackType = 'bug' | 'suggestie' | 'vraag'

const TYPES: { value: FeedbackType; label: string; Icon: typeof Bug }[] = [
  { value: 'bug',       label: 'Bug',       Icon: Bug },
  { value: 'suggestie', label: 'Suggestie', Icon: Lightbulb },
  { value: 'vraag',     label: 'Vraag',     Icon: HelpCircle },
]

export function FeedbackButton() {
  const { profile } = useProfile()
  const [open,       setOpen]       = useState(false)
  const [type,       setType]       = useState<FeedbackType>('bug')
  const [message,    setMessage]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)

  if (!profile) return null

  function openPanel() {
    setDone(false)
    setMessage('')
    setType('bug')
    setOpen(true)
  }

  async function handleSubmit() {
    if (!message.trim() || submitting) return
    setSubmitting(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, message: message.trim(), page_url: window.location.pathname }),
      })

      if (res.ok) {
        setDone(true)
        setTimeout(() => setOpen(false), 2200)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={openPanel}
        title="Feedback geven"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ backgroundColor: '#1B6B4A', outlineColor: '#1B6B4A' }}
      >
        <MessageSquare size={20} className="text-white" />
      </button>

      {/* Slide-up panel */}
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />

          <div className="fixed bottom-20 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-900">Feedback geven</span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-0.5 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {done ? (
              /* Success state */
              <div className="flex flex-col items-center gap-2 py-10">
                <CheckCircle2 size={36} className="text-primary-500" />
                <p className="font-semibold text-gray-900">Bedankt!</p>
                <p className="text-sm text-gray-400">Je feedback is ontvangen.</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Type tabs */}
                <div className="flex gap-1.5">
                  {TYPES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => setType(value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        type === value
                          ? 'bg-primary-50 border-primary-200 text-primary-700'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  autoFocus
                  placeholder={
                    type === 'bug'
                      ? 'Beschrijf wat er misgaat…'
                      : type === 'suggestie'
                      ? 'Deel je idee of suggestie…'
                      : 'Stel je vraag…'
                  }
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit() }}
                  className="input resize-none h-24 text-sm"
                />

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !message.trim()}
                  className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-2"
                >
                  {submitting
                    ? <><Loader2 size={14} className="animate-spin" /> Versturen…</>
                    : 'Versturen'
                  }
                </button>

                <p className="text-center text-xs text-gray-400">Ctrl+Enter om te versturen</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
