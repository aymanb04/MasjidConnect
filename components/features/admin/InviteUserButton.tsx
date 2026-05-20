'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { Plus, X, Loader2, Mail } from 'lucide-react'

interface Props {
  tenantId?: string
  onInvited?: () => void
}

export function InviteUserButton({ tenantId, onInvited }: Props) {
  const { profile } = useProfile()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const [tenants, setTenants] = useState<any[]>([])
  const [groups, setGroups]   = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [form, setForm] = useState({
    email: '', first_name: '', last_name: '',
    role: 'student', group_id: '', class_id: '',
    tenant_id: tenantId ?? '',
  })

  const isSuperAdmin = profile?.role === 'super_admin'
  const isStudent    = form.role === 'student'
  const isTeacher    = form.role === 'teacher'

  // Super admin: load all mosques
  useEffect(() => {
    if (!open || !isSuperAdmin) return
    supabase.from('tenants').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setTenants(data ?? []))
  }, [open, isSuperAdmin])

  // Load groups + classes when tenant changes
  useEffect(() => {
    const tid = form.tenant_id
    if (!open || !tid) { setGroups([]); setClasses([]); return }

    supabase.from('groups').select('id, name').eq('tenant_id', tid).order('name')
      .then(({ data }) => setGroups(data ?? []))

    supabase.from('classes').select('id, name').eq('tenant_id', tid).eq('is_archived', false).order('name')
      .then(({ data }) => setClasses(data ?? []))
  }, [open, form.tenant_id])

  function handleTenantChange(tid: string) {
    setForm(p => ({ ...p, tenant_id: tid, group_id: '', class_id: '' }))
  }

  function handleRoleChange(role: string) {
    setForm(p => ({ ...p, role, group_id: '', class_id: '' }))
  }

  async function handleInvite() {
    if (!form.email || !form.first_name || !form.last_name || !form.tenant_id) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          email:      form.email.trim().toLowerCase(),
          first_name: form.first_name.trim(),
          last_name:  form.last_name.trim(),
          role:       form.role,
          tenant_id:  form.tenant_id,
          group_id:   (isStudent || isTeacher) ? (form.group_id || null) : null,
          class_id:   isTeacher ? (form.class_id || null) : null,
          class_role: form.role,
          invited_by: profile?.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setError('Fout: ' + data.error); setLoading(false); return }

      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        setForm({ email: '', first_name: '', last_name: '', role: 'student', group_id: '', class_id: '', tenant_id: tenantId ?? '' })
        onInvited?.()
      }, 1200)
    } finally { setLoading(false) }
  }

  const canSubmit = !loading && !!form.email && !!form.first_name && !!form.last_name && !!form.tenant_id

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

              {/* Mosque — super admin only */}
              {isSuperAdmin && (
                <div>
                  <label className="label">Moskee *</label>
                  <select value={form.tenant_id} onChange={e => handleTenantChange(e.target.value)} className="input">
                    <option value="">Kies een moskee…</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Name */}
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

              {/* Email */}
              <div>
                <label className="label">E-mailadres *</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="ahmed@email.be" className="input"/>
              </div>

              {/* Role */}
              <div>
                <label className="label">Rol *</label>
                <select value={form.role} onChange={e => handleRoleChange(e.target.value)} className="input">
                  <option value="student">Leerling</option>
                  <option value="teacher">Leerkracht</option>
                  <option value="admin">Beheerder</option>
                </select>
              </div>

              {/* Group — students only */}
              {isStudent && (
                <div>
                  <label className="label">
                    Groep <span className="text-gray-400">(optioneel)</span>
                  </label>
                  <select
                    value={form.group_id}
                    onChange={e => setForm(p => ({ ...p, group_id: e.target.value }))}
                    className="input"
                    disabled={!form.tenant_id}
                  >
                    <option value="">Geen groep</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {form.group_id && (
                    <p className="text-xs text-gray-400 mt-1">
                      Leerling wordt automatisch ingeschreven in alle vakken van deze groep.
                    </p>
                  )}
                </div>
              )}

              {/* Group + class — teachers only */}
              {isTeacher && (
                <>
                  <div>
                    <label className="label">
                      Groep <span className="text-gray-400">(optioneel)</span>
                    </label>
                    <select
                      value={form.group_id}
                      onChange={e => setForm(p => ({ ...p, group_id: e.target.value, class_id: '' }))}
                      className="input"
                      disabled={!form.tenant_id}
                    >
                      <option value="">Geen groep</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    {form.group_id && (
                      <p className="text-xs text-gray-400 mt-1">
                        Leerkracht wordt toegewezen aan alle vakken van deze groep.
                      </p>
                    )}
                  </div>
                  {!form.group_id && (
                    <div>
                      <label className="label">
                        Of specifieke klas <span className="text-gray-400">(optioneel)</span>
                      </label>
                      <select
                        value={form.class_id}
                        onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))}
                        className="input"
                        disabled={!form.tenant_id}
                      >
                        <option value="">Geen klas</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

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
              <button
                onClick={handleInvite}
                disabled={!canSubmit}
                className={`btn-primary flex-1 justify-center ${success ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
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
