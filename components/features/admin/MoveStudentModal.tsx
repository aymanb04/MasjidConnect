'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { X, Loader2, Plus, Trash2, ArrowLeftRight, CheckCircle2 } from 'lucide-react'

interface Props {
  student: { id: string; first_name: string; last_name: string }
  tenantId: string
  onClose: () => void
  onSaved: () => void
}

interface ClassOption {
  id: string
  name: string
  color: string
  group_name?: string
  school_year_name?: string
}

export function MoveStudentModal({ student, tenantId, onClose, onSaved }: Props) {
  const [currentClasses, setCurrentClasses] = useState<ClassOption[]>([])
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([])
  const [toAdd,    setToAdd]    = useState<string[]>([])       // class IDs to enroll
  const [toRemove, setToRemove] = useState<Set<string>>(new Set()) // class IDs to unenroll
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)
  const [addSelect, setAddSelect] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)

    // Current enrollments
    const { data: enrolled } = await supabase
      .from('class_students')
      .select('classes(id, name, color, groups(name), school_years(name))')
      .eq('student_id', student.id)

    const currentIds = new Set<string>()
    const current: ClassOption[] = []
    for (const row of (enrolled ?? [])) {
      const c = (row as any).classes
      if (!c) continue
      currentIds.add(c.id)
      current.push({
        id:   c.id,
        name: c.name,
        color: c.color,
        group_name:      c.groups?.name,
        school_year_name: c.school_years?.name,
      })
    }
    setCurrentClasses(current)

    // All active classes in tenant (not yet enrolled)
    const { data: all } = await supabase
      .from('classes')
      .select('id, name, color, groups(name), school_years(name)')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')

    setAvailableClasses(
      (all ?? [])
        .filter((c: any) => !currentIds.has(c.id))
        .map((c: any) => ({
          id:   c.id,
          name: c.name,
          color: c.color,
          group_name:       c.groups?.name,
          school_year_name: c.school_years?.name,
        }))
    )

    setLoading(false)
  }

  function toggleRemove(classId: string) {
    setToRemove(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId); else next.add(classId)
      return next
    })
  }

  function addPending() {
    if (!addSelect) return
    setToAdd(prev => prev.includes(addSelect) ? prev : [...prev, addSelect])
    setAddSelect('')
  }

  function cancelAdd(classId: string) {
    setToAdd(prev => prev.filter(id => id !== classId))
  }

  async function handleSave() {
    if (toAdd.length === 0 && toRemove.size === 0) { onClose(); return }
    setSaving(true)

    try {
      // Remove enrollments
      for (const classId of Array.from(toRemove)) {
        await supabase.from('class_students')
          .delete()
          .eq('class_id', classId)
          .eq('student_id', student.id)
      }

      // Add new enrollments
      if (toAdd.length > 0) {
        await supabase.from('class_students')
          .upsert(
            toAdd.map(classId => ({ class_id: classId, student_id: student.id })),
            { onConflict: 'class_id,student_id', ignoreDuplicates: true }
          )
      }

      setDone(true)
      setTimeout(() => { onSaved(); onClose() }, 1200)
    } catch (err: any) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const pendingAdd = availableClasses.filter(c => toAdd.includes(c.id))
  const allAvailableForDropdown = availableClasses.filter(c => !toAdd.includes(c.id))
  const hasChanges = toAdd.length > 0 || toRemove.size > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-primary-600" />
            <span className="font-semibold text-gray-900 text-sm">
              Verplaatsen — {student.first_name} {student.last_name}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-0.5">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <CheckCircle2 size={36} className="text-primary-500" />
            <p className="font-semibold text-gray-900">Opgeslagen!</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Laden…
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* Current enrollments */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Huidige klassen
              </p>
              {currentClasses.length === 0 ? (
                <p className="text-sm text-gray-400">Niet ingeschreven in een klas.</p>
              ) : (
                <div className="space-y-1.5">
                  {currentClasses.map(cls => {
                    const marked = toRemove.has(cls.id)
                    return (
                      <div
                        key={cls.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                          marked
                            ? 'border-red-200 bg-red-50'
                            : 'border-border bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: cls.color }}
                        >
                          {cls.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${marked ? 'text-red-600 line-through' : 'text-gray-800'}`}>
                            {cls.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {[cls.group_name, cls.school_year_name].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleRemove(cls.id)}
                          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                            marked
                              ? 'bg-red-100 text-red-500 hover:bg-red-200'
                              : 'text-gray-300 hover:text-red-400 hover:bg-red-50'
                          }`}
                          title={marked ? 'Ongedaan maken' : 'Verwijderen uit klas'}
                        >
                          {marked ? <Plus size={13} className="rotate-45" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pending additions */}
            {pendingAdd.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Toe te voegen
                </p>
                <div className="space-y-1.5">
                  {pendingAdd.map(cls => (
                    <div
                      key={cls.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-primary-200 bg-primary-50/40"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: cls.color }}
                      >
                        {cls.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary-700 truncate">{cls.name}</p>
                        <p className="text-xs text-gray-400">
                          {[cls.group_name, cls.school_year_name].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <button
                        onClick={() => cancelAdd(cls.id)}
                        className="p-1.5 rounded-lg text-primary-300 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Verwijder uit lijst"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add to class */}
            {allAvailableForDropdown.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Toevoegen aan klas
                </p>
                <div className="flex gap-2">
                  <select
                    value={addSelect}
                    onChange={e => setAddSelect(e.target.value)}
                    className="input flex-1 text-sm"
                  >
                    <option value="">Kies een klas…</option>
                    {allAvailableForDropdown.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}{cls.group_name ? ` — ${cls.group_name}` : ''}{cls.school_year_name ? ` (${cls.school_year_name})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addPending}
                    disabled={!addSelect}
                    className="btn-secondary text-sm py-2 px-3 flex-shrink-0 flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus size={14} /> Toevoegen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!done && !loading && (
          <div className="flex gap-3 px-6 py-4 border-t border-border bg-gray-50/50">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Opslaan…</>
                : 'Opslaan'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
