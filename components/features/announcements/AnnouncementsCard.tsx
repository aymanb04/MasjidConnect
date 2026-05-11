'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { formatRelative } from '@/lib/utils'
import type { Profile, Announcement } from '@/lib/types'
import { Megaphone, Plus, X, Loader2, School, Trash2 } from 'lucide-react'

export function AnnouncementsCard({ profile }: { profile: Profile }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ title: '', content: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving]     = useState(false)

  const canPost = ['admin', 'super_admin', 'teacher'].includes(profile.role)

  useEffect(() => { loadAnnouncements() }, [])

  async function loadAnnouncements() {
    if (!profile.tenant_id) { setLoading(false); return }
    const { data } = await supabase
      .from('announcements')
      .select('*, creator:profiles!created_by(id, first_name, last_name)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(15)
    setAnnouncements((data ?? []) as Announcement[])
    setLoading(false)
  }

  async function handleSubmit() {
    if (!form.title.trim()) return
    setSaving(true)
    setFormError('')
    const { error } = await supabase.from('announcements').insert({
      tenant_id:  profile.tenant_id,
      created_by: profile.id,
      title:      form.title.trim(),
      content:    form.content.trim() || null,
      class_id:   null,
    })
    if (!error) {
      setShowForm(false)
      setForm({ title: '', content: '' })
      loadAnnouncements()
    } else {
      setFormError(error.message)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  if (loading) return null

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Megaphone size={17} className="text-primary-600" /> Aankondigingen
        </h2>
        {canPost && !showForm && (
          <button onClick={() => { setForm({ title: '', content: '' }); setFormError(''); setShowForm(true) }}
            className="btn-secondary text-xs py-1.5 px-3">
            <Plus size={13} /> Plaatsen
          </button>
        )}
        {canPost && showForm && (
          <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-border space-y-3">
          <input
            type="text"
            placeholder="Titel *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="input"
          />
          <textarea
            placeholder="Bericht (optioneel)"
            value={form.content}
            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
            className="input resize-none h-20"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary text-xs py-1.5 px-3">
              Annuleren
            </button>
            <button onClick={handleSubmit} disabled={saving || !form.title.trim()}
              className="btn-primary text-xs py-1.5 px-3">
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Plaatsen'}
            </button>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <div className="text-center py-6">
          <Megaphone size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">Nog geen aankondigingen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann: any) => {
            const canDelete = ann.created_by === profile.id || ['admin', 'super_admin'].includes(profile.role)
            return (
              <div key={ann.id} className="group flex gap-3 p-3.5 rounded-xl border border-border hover:border-primary-100 hover:bg-primary-50/20 transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: '#1B6B4A' }}>
                  <School size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-gray-900">{ann.title}</div>
                    {canDelete && (
                      <button onClick={() => handleDelete(ann.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 p-0.5">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {ann.content && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ann.content}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-gray-400">
                      {ann.creator?.first_name} {ann.creator?.last_name}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{formatRelative(ann.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
