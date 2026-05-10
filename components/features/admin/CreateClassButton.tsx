'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Plus, X, Loader2, GraduationCap } from 'lucide-react'

interface Props {
  tenantId: string
  onCreated?: () => void
}

export function CreateClassButton({ tenantId, onCreated }: Props) {
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [loadingYears, setLoadingYears]   = useState(false)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [groups, setGroups]           = useState<any[]>([])
  const [form, setForm] = useState({
    name: '', description: '', school_year_id: '', color: '#1B6B4A',
    group_id: '', new_group_name: '',
  })
  const colors = ['#1B6B4A','#1E3A5F','#B8861A','#7C3AED','#DC2626','#0891B2','#059669','#D97706']

  // Load school years when modal opens
  useEffect(() => {
    if (!open || !tenantId) return
    setLoadingYears(true)
    supabase
      .from('school_years')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .then(async ({ data }) => {
        let years = data ?? []
        if (!years.length) {
          const year = new Date().getFullYear()
          const { data: newYear } = await supabase
            .from('school_years')
            .insert({
              tenant_id: tenantId,
              name: `${year}-${year + 1}`,
              start_date: `${year}-09-01`,
              end_date: `${year + 1}-06-30`,
              is_active: true,
            })
            .select()
            .single()
          if (newYear) years = [newYear]
        }
        setSchoolYears(years)
        if (years.length) setForm(p => ({ ...p, school_year_id: years[0].id }))
        setLoadingYears(false)
      })
  }, [open, tenantId])

  // Reload groups whenever school year changes
  useEffect(() => {
    if (!form.school_year_id) { setGroups([]); return }
    setLoadingGroups(true)
    supabase
      .from('groups')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('school_year_id', form.school_year_id)
      .order('name')
      .then(({ data }) => { setGroups(data ?? []); setLoadingGroups(false) })
  }, [form.school_year_id, tenantId])

  async function handleCreate() {
    if (!form.name.trim() || !form.school_year_id) return
    setLoading(true)
    try {
      let group_id: string | null = form.group_id || null

      // Create new group on the fly if requested
      if (form.group_id === 'new' && form.new_group_name.trim()) {
        const { data: newGroup } = await supabase
          .from('groups')
          .insert({
            tenant_id: tenantId,
            school_year_id: form.school_year_id,
            name: form.new_group_name.trim(),
          })
          .select('id')
          .single()
        group_id = newGroup?.id ?? null
      }

      await supabase.from('classes').insert({
        tenant_id:      tenantId,
        school_year_id: form.school_year_id,
        group_id,
        name:           form.name.trim(),
        description:    form.description || null,
        color:          form.color,
      })

      setOpen(false)
      setForm({ name: '', description: '', school_year_id: '', color: '#1B6B4A', group_id: '', new_group_name: '' })
      onCreated?.()
    } finally { setLoading(false) }
  }

  const isNewGroup = form.group_id === 'new'
  const canSubmit  = !loading && !loadingYears && !!form.name.trim() && !!form.school_year_id &&
                     (!isNewGroup || !!form.new_group_name.trim())

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3">
        <Plus size={13}/> Klas aanmaken
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                  <GraduationCap size={16} className="text-primary-600"/>
                </div>
                <h2 className="font-semibold text-gray-900">Nieuwe klas</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18}/>
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* School year */}
              <div>
                <label className="label">Schooljaar *</label>
                {loadingYears ? (
                  <div className="input flex items-center gap-2 text-gray-400">
                    <Loader2 size={14} className="animate-spin"/> Laden…
                  </div>
                ) : (
                  <select
                    value={form.school_year_id}
                    onChange={e => setForm(p => ({ ...p, school_year_id: e.target.value, group_id: '', new_group_name: '' }))}
                    className="input"
                  >
                    <option value="">Kies schooljaar…</option>
                    {schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.name}</option>)}
                  </select>
                )}
              </div>

              {/* Group */}
              <div>
                <label className="label">
                  Groep <span className="text-gray-400">(optioneel)</span>
                </label>
                {loadingGroups ? (
                  <div className="input flex items-center gap-2 text-gray-400">
                    <Loader2 size={14} className="animate-spin"/> Laden…
                  </div>
                ) : (
                  <select
                    value={form.group_id}
                    onChange={e => setForm(p => ({ ...p, group_id: e.target.value, new_group_name: '' }))}
                    className="input"
                    disabled={!form.school_year_id}
                  >
                    <option value="">Geen groep</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    <option value="new">+ Nieuwe groep aanmaken…</option>
                  </select>
                )}
                {isNewGroup && (
                  <input
                    autoFocus
                    type="text"
                    value={form.new_group_name}
                    onChange={e => setForm(p => ({ ...p, new_group_name: e.target.value }))}
                    placeholder="Naam van de groep (bijv. Groep 1)"
                    className="input mt-2"
                  />
                )}
              </div>

              {/* Subject name */}
              <div>
                <label className="label">Vak *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Arabisch, Islam, Koran…"
                  className="input"
                />
              </div>

              {/* Description */}
              <div>
                <label className="label">Beschrijving <span className="text-gray-400">(optioneel)</span></label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Leeftijd 10-12"
                  className="input"
                />
              </div>

              {/* Color */}
              <div>
                <label className="label">Kleur</label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(p => ({ ...p, color: c }))}
                      className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">
                Annuleren
              </button>
              <button onClick={handleCreate} disabled={!canSubmit} className="btn-primary flex-1 justify-center">
                {loading
                  ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</>
                  : 'Klas aanmaken'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default CreateClassButton
