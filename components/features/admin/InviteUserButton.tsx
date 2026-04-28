'use client'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { Plus, X, Loader2, Mail, GraduationCap } from 'lucide-react'
import { slugify } from '@/lib/utils'

export function InviteUserButton({ tenantId, classes, onInvited }: { tenantId: string; classes: any[]; onInvited?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'student', class_id: '' })

  async function handleInvite() {
    if (!form.email || !form.first_name || !form.last_name) return
    setLoading(true)
    try {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()

      await supabase.from('invitations').insert({
        tenant_id: tenantId, email: form.email.trim().toLowerCase(),
        role: form.role, class_id: form.class_id || null, invited_by: session!.user.id,
      })

      setSuccess(true)
      setTimeout(() => { setOpen(false); setSuccess(false); setForm({ email: '', first_name: '', last_name: '', role: 'student', class_id: '' }); onInvited?.() }, 1200)
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3"><Plus size={13}/> Gebruiker toevoegen</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2"><div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center"><Mail size={16} className="text-blue-600"/></div><h2 className="font-semibold text-gray-900">Gebruiker toevoegen</h2></div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Voornaam *</label><input type="text" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} placeholder="Ahmed" className="input"/></div>
                <div><label className="label">Achternaam *</label><input type="text" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="Hassan" className="input"/></div>
              </div>
              <div><label className="label">E-mailadres *</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="ahmed@email.be" className="input"/></div>
              <div><label className="label">Rol *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input">
                  <option value="student">Leerling</option><option value="teacher">Leerkracht</option><option value="admin">Beheerder</option>
                </select>
              </div>
              <div><label className="label">Klas <span className="text-gray-400">(optioneel)</span></label>
                <select value={form.class_id} onChange={e => setForm(p => ({ ...p, class_id: e.target.value }))} className="input">
                  <option value="">Geen klas</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Annuleren</button>
              <button onClick={handleInvite} disabled={loading || !form.email || !form.first_name || !form.last_name} className={`btn-primary flex-1 justify-center ${success ? 'bg-green-600 hover:bg-green-700' : ''}`}>
                {loading ? <><Loader2 size={15} className="animate-spin"/> Toevoegen…</> : success ? '✓ Toegevoegd!' : 'Toevoegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function CreateClassButton({ tenantId, schoolYears, onCreated }: { tenantId: string; schoolYears: any[]; onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', school_year_id: '', color: '#1B6B4A' })
  const colors = ['#1B6B4A','#1E3A5F','#B8861A','#7C3AED','#DC2626','#0891B2','#059669','#D97706']

  async function handleCreate() {
    if (!form.name.trim() || !form.school_year_id) return
    setLoading(true)
    try {
      const supabase = getSupabase()
      await supabase.from('classes').insert({ tenant_id: tenantId, school_year_id: form.school_year_id, name: form.name.trim(), description: form.description || null, color: form.color })
      setOpen(false)
      setForm({ name: '', description: '', school_year_id: '', color: '#1B6B4A' })
      onCreated?.()
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3"><Plus size={13}/> Klas aanmaken</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2"><div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center"><GraduationCap size={16} className="text-primary-600"/></div><h2 className="font-semibold text-gray-900">Nieuwe klas</h2></div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="label">Naam *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Groep 3A — Koran" className="input"/></div>
              <div><label className="label">Schooljaar *</label>
                <select value={form.school_year_id} onChange={e => setForm(p => ({ ...p, school_year_id: e.target.value }))} className="input">
                  <option value="">Kies schooljaar…</option>{schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.name}</option>)}
                </select>
              </div>
              <div><label className="label">Beschrijving <span className="text-gray-400">(optioneel)</span></label><input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Leeftijd 10-12" className="input"/></div>
              <div><label className="label">Kleur</label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map(c => <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))} className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }}/>)}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Annuleren</button>
              <button onClick={handleCreate} disabled={loading || !form.name.trim() || !form.school_year_id} className="btn-primary flex-1 justify-center">
                {loading ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</> : 'Klas aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default InviteUserButton
