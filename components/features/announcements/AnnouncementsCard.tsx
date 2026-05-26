'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { formatRelative } from '@/lib/utils'
import type { Profile, Announcement } from '@/lib/types'
import { Megaphone, Plus, X, Loader2, School, Trash2, Tag } from 'lucide-react'

interface ClassOption {
  id: string
  name: string
  color: string
}

export function AnnouncementsCard({ profile }: { profile: Profile }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState({ title: '', content: '', class_id: '' })
  const [formError,     setFormError]     = useState('')
  const [saving,        setSaving]        = useState(false)
  const [filterClassId, setFilterClassId] = useState<string | null>(null)
  const [myClasses,     setMyClasses]     = useState<ClassOption[]>([])

  const canPost = ['admin', 'super_admin', 'teacher'].includes(profile.role)
  // Teachers must always post to a specific class (enforced by DB RLS as well)
  const mustPickClass = profile.role === 'teacher'

  useEffect(() => {
    loadAnnouncements()
    loadMyClasses()
  }, [])

  // ── Load announcements (with class info) ──────────────────────────────────

  async function loadAnnouncements() {
    if (!profile.tenant_id) { setLoading(false); return }
    const { data } = await supabase
      .from('announcements')
      .select('*, creator:profiles!created_by(id, first_name, last_name), class:classes(id, name, color)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(30)
    setAnnouncements((data ?? []) as Announcement[])
    setLoading(false)
  }

  // ── Load classes this user belongs to / teaches ────────────────────────────

  async function loadMyClasses() {
    if (!profile.tenant_id) return

    if (profile.role === 'student') {
      const { data } = await supabase
        .from('class_students')
        .select('classes(id, name, color)')
        .eq('student_id', profile.id)
      setMyClasses(
        (data ?? [])
          .map((r: any) => r.classes)
          .filter(Boolean) as ClassOption[]
      )
    } else if (profile.role === 'teacher') {
      const { data } = await supabase
        .from('class_teachers')
        .select('classes(id, name, color)')
        .eq('teacher_id', profile.id)
      setMyClasses(
        (data ?? [])
          .map((r: any) => r.classes)
          .filter(Boolean) as ClassOption[]
      )
    } else {
      // admin / super_admin — all classes in their tenant
      const { data } = await supabase
        .from('classes')
        .select('id, name, color')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_archived', false)
        .order('name')
      setMyClasses((data ?? []) as ClassOption[])
    }
  }

  // ── Submit new announcement ────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form.title.trim()) return
    if (mustPickClass && !form.class_id) {
      setFormError('Kies een klas voor deze aankondiging.')
      return
    }
    setSaving(true)
    setFormError('')
    const { error } = await supabase.from('announcements').insert({
      tenant_id:  profile.tenant_id,
      created_by: profile.id,
      title:      form.title.trim(),
      content:    form.content.trim() || null,
      class_id:   form.class_id || null,
    })
    if (!error) {
      setShowForm(false)
      setForm({ title: '', content: '', class_id: '' })
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

  // ── Derive filter tabs from loaded announcements ──────────────────────────
  // Show only classes that actually have announcements (+ "Alle")
  const classesWithAnnouncements: ClassOption[] = []
  const seenIds = new Set<string>()
  for (const ann of announcements) {
    const cls = (ann as any).class
    if (cls && !seenIds.has(cls.id)) {
      seenIds.add(cls.id)
      classesWithAnnouncements.push(cls)
    }
  }

  const filtered = filterClassId === null
    ? announcements
    : announcements.filter((a: any) => a.class_id === filterClassId)

  if (loading) return null

  return (
    <div className="card p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Megaphone size={17} className="text-primary-600" /> Aankondigingen
        </h2>
        {canPost && !showForm && (
          <button
            onClick={() => { setForm({ title: '', content: '', class_id: '' }); setFormError(''); setShowForm(true) }}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            <Plus size={13} /> Plaatsen
          </button>
        )}
        {canPost && showForm && (
          <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filter tabs — only show when there are class-specific announcements */}
      {classesWithAnnouncements.length > 0 && !showForm && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <button
            onClick={() => setFilterClassId(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterClassId === null
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Alle
          </button>
          {classesWithAnnouncements.map(cls => (
            <button
              key={cls.id}
              onClick={() => setFilterClassId(filterClassId === cls.id ? null : cls.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterClassId === cls.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: cls.color }}
              />
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {/* New announcement form */}
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

          {/* Class selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Tag size={11} />
              {mustPickClass ? 'Klas *' : 'Klas (leeg = voor iedereen)'}
            </label>
            <select
              value={form.class_id}
              onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}
              className="input text-sm"
            >
              {!mustPickClass && <option value="">Voor iedereen (school-breed)</option>}
              {mustPickClass && <option value="">Kies een klas…</option>}
              {myClasses.map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          {formError && <p className="text-xs text-red-500">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary text-xs py-1.5 px-3">
              Annuleren
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.title.trim() || (mustPickClass && !form.class_id)}
              className="btn-primary text-xs py-1.5 px-3"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Plaatsen'}
            </button>
          </div>
        </div>
      )}

      {/* Announcements list */}
      {filtered.length === 0 ? (
        <div className="text-center py-6">
          <Megaphone size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">
            {filterClassId ? 'Geen aankondigingen voor deze klas.' : 'Nog geen aankondigingen.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann: any) => {
            const canDelete = ann.created_by === profile.id || ['admin', 'super_admin'].includes(profile.role)
            const cls: ClassOption | null = ann.class ?? null

            return (
              <div
                key={ann.id}
                className="group flex gap-3 p-3.5 rounded-xl border border-border hover:border-primary-100 hover:bg-primary-50/20 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: cls?.color ?? '#1B6B4A' }}
                >
                  <School size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900">{ann.title}</div>
                      {cls && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full mt-0.5"
                          style={{ backgroundColor: `${cls.color}20`, color: cls.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cls.color }} />
                          {cls.name}
                        </span>
                      )}
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(ann.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 p-0.5"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {ann.content && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
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
