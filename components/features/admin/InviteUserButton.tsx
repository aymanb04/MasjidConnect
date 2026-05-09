'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { Plus, X, Loader2, Mail } from 'lucide-react'

interface Props {
  tenantId?: string
  classes?: any[]
  onInvited?: () => void
}

export function InviteUserButton({ tenantId, classes: initialClasses, onInvited }: Props) {
  const { profile } = useProfile()
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')
  const [tenants, setTenants]   = useState<any[]>([])
  const [classes, setClasses]   = useState<any[]>(initialClasses ?? [])
  const [form, setForm]         = useState({
    email: '', first_name: '', last_name: '',
    role: 'student', class_id: '', tenant_id: tenantId ?? ''
  })

  const isSuperAdmin = profile?.role === 'super_admin'

  // Super admin: laad alle moskeeën
  useEffect(() => {
    if (!open || !isSuperAdmin) return
    supabase.from('tenants').select('id, name').eq('is_active', true).order('name')
        .then(({ data }) => setTenants(data ?? []))
  }, [open, isSuperAdmin])

  // Laad klassen wanneer tenant verandert
  async function handleTenantChange(tid: string) {
    setForm(p => ({ ...p, tenant_id: tid, class_id: '' }))
    if (!tid) { setClasses([]); return }
    const { data } = await supabase.from('classes')
        .select('id, name').eq('tenant_id', tid).eq('is_archived', false).order('name')
    setClasses(data ?? [])
  }

  async function handleInvite() {
    if (!form.email || !form.first_name || !form.last_name || !form.tenant_id) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:      form.email.trim().toLowerCase(),
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          role:       form.role,
          tenant_id:  form.tenant_id,
          class_id:   form.class_id || null,
          class_role: form.role,
          invited_by: profile?.id,
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setError('Fout: ' + data.error)
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        setForm({ email: '', first_name: '', last_name: '', role: 'student', class_id: '', tenant_id: tenantId ?? '' })
        onInvited?.()
      }, 1200)
    } finally { setLoading(false) }
  }

  return (
      <>
        <button onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3">
          <Plus size={13}/> Gebruiker toevoegen
        </button>

        {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
              <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                      <Mail size={16} className="text-blue-600"/>
                    </div>
                    <h2 className="font-semibold text-gray-900">Gebruiker toevoegen</h2>
                  </div>
                  <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={18}/>
                  </button>
                </div>

                <div className="p-6 space-y-4">

                  {/* Moskee selector — enkel voor super admin */}
                  {isSuperAdmin && (
                      <div>
                        <label className="label">Moskee *</label>
                        <select
                            value={form.tenant_id}
                            onChange={e => handleTenantChange(e.target.value)}
                            className="input"
                        >
                          <option value="">Kies een moskee…</option>
                          {tenants.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Voornaam *</label>
                      <input type="text" value={form.first_name}
                             onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                             placeholder="Ahmed" className="input"/>
                    </div>
                    <div>
                      <label className="label">Achternaam *</label>
                      <input type="text" value={form.last_name}
                             onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                             placeholder="Hassan" className="input"/>
                    </div>
                  </div>

                  <div>
                    <label className="label">E-mailadres *</label>
                    <input type="email" value={form.email}
                           onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                           placeholder="ahmed@email.be" className="input"/>
                  </div>

                  <div>
                    <label className="label">Rol *</label>
                    <select value={form.role}
                            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                            className="input">
                      <option value="student">Leerling</option>
                      <option value="teacher">Leerkracht</option>
                      <option value="admin">Beheerder</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Klas <span className="text-gray-400">(optioneel)</span></label>
                    <select value={form.class_id}
                            onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}
                            className="input"
                            disabled={!form.tenant_id}
                    >
                      <option value="">Geen klas</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                        {error}
                      </div>
                  )}
                </div>

                <div className="flex gap-3 p-6 border-t border-border">
                  <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">
                    Annuleren
                  </button>
                  <button onClick={handleInvite}
                          disabled={loading || !form.email || !form.first_name || !form.last_name || !form.tenant_id}
                          className={`btn-primary flex-1 justify-center ${success ? 'bg-green-600 hover:bg-green-700' : ''}`}>
                    {loading
                        ? <><Loader2 size={15} className="animate-spin"/> Toevoegen…</>
                        : success ? '✓ Uitnodiging verstuurd!'
                            : 'Uitnodiging sturen'
                    }
                  </button>
                </div>
              </div>
            </div>
        )}
      </>
  )
}

export default InviteUserButton