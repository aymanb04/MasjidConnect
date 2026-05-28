'use client'
import { useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { Plus, X, Loader2, Building2 } from 'lucide-react'
import { slugify } from '@/lib/utils'

export default function CreateTenantButton({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', city: '', email: '', subscription_status: 'active', subscription_price: '500', subscription_interval: 'yearly', admin_email: '', admin_first: '', admin_last: '' })

  function handleNameChange(name: string) { setForm(p => ({ ...p, name, slug: slugify(name) })) }

  async function handleCreate() {
    if (!form.name || !form.slug) return
    setLoading(true)
    try {
      const supabase = getSupabase()
      const { data: tenant } = await supabase.from('tenants').insert({
        name: form.name.trim(), slug: form.slug.trim(), city: form.city || null, email: form.email || null,
        subscription_status: form.subscription_status, subscription_price: parseFloat(form.subscription_price),
        subscription_interval: form.subscription_interval, is_active: true,
      }).select().single()

      const year = new Date().getFullYear()
      await supabase.from('school_years').insert({ tenant_id: tenant!.id, name: `${year}-${year+1}`, start_date: `${year}-09-01`, end_date: `${year+1}-06-30`, is_active: true })

      setOpen(false)
      setForm({ name: '', slug: '', city: '', email: '', subscription_status: 'active', subscription_price: '500', subscription_interval: 'yearly', admin_email: '', admin_first: '', admin_last: '' })
      onCreated?.()
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16}/> Moskee toevoegen</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}/>
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg my-8 animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2"><div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center"><Building2 size={16} className="text-primary-600"/></div><h2 className="font-semibold text-gray-900">Nieuwe moskee</h2></div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div><label className="label">Naam *</label><input type="text" value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Moskee Al-Nour Antwerpen" className="input"/></div>
              <div><label className="label">URL slug *</label>
                <div className="flex items-center">
                  <span className="px-3 py-2.5 bg-gray-100 border border-r-0 border-border rounded-l-xl text-sm text-gray-500">masjidconnect.be/</span>
                  <input type="text" value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} className="input rounded-l-none" placeholder="al-nour-antwerpen"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Stad</label><input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Antwerpen" className="input"/></div>
                <div><label className="label">E-mail</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="info@moskee.be" className="input"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Prijs (€)</label><input type="number" value={form.subscription_price} onChange={e => setForm(p => ({ ...p, subscription_price: e.target.value }))} className="input"/></div>
                <div><label className="label">Status</label>
                  <select value={form.subscription_status} onChange={e => setForm(p => ({ ...p, subscription_status: e.target.value }))} className="input">
                    <option value="active">Actief</option><option value="trial">Proefperiode</option><option value="inactive">Inactief</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Annuleren</button>
              <button onClick={handleCreate} disabled={loading || !form.name || !form.slug} className="btn-primary flex-1 justify-center">
                {loading ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</> : 'Moskee toevoegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
