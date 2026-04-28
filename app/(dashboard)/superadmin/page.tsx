'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { formatDate } from '@/lib/utils'
import { Building2, Users, TrendingUp, Shield, Plus, X, Loader2, GraduationCap } from 'lucide-react'

export default function SuperAdminPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [tenants, setTenants] = useState<any[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddMoskee, setShowAddMoskee] = useState(false)
  const [showAddKlas, setShowAddKlas] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'super_admin') return
    loadData()
  }, [profile])

  async function loadData() {
    const { data: t } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    setTenants(t ?? [])
    setTotalUsers(count ?? 0)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (profile?.role !== 'super_admin') return <div className="card p-8 text-center text-gray-400">Geen toegang.</div>

  const activeTenants = tenants.filter(t => t.is_active && t.subscription_status === 'active')
  const monthlyRevenue = activeTenants.reduce((sum, t) =>
    sum + (t.subscription_interval === 'monthly' ? t.subscription_price : t.subscription_price / 12), 0)

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700', trial: 'bg-blue-100 text-blue-700',
    inactive: 'bg-gray-100 text-gray-600', cancelled: 'bg-red-100 text-red-700'
  }
  const statusLabels: Record<string, string> = {
    active: 'Actief', trial: 'Proefperiode', inactive: 'Inactief', cancelled: 'Opgezegd'
  }

  return (
    <div className="animate-slide-up">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Shield size={22} className="text-primary-600"/> Super Admin</h1>
          <p className="page-subtitle">Overzicht van alle moskeeën op het platform</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddKlas(true)} className="btn-secondary"><GraduationCap size={15}/> Klas toevoegen</button>
          <button onClick={() => setShowAddMoskee(true)} className="btn-primary"><Plus size={16}/> Moskee toevoegen</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Moskeeën', value: tenants.length, icon: Building2, color: 'bg-primary-50 text-primary-600' },
          { label: 'Actieve klanten', value: activeTenants.length, icon: TrendingUp, color: 'bg-green-50 text-green-600' },
          { label: 'Totaal gebruikers', value: totalUsers, icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'MRR', value: `€${Math.round(monthlyRevenue)}`, icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.color}`}><s.icon size={20}/></div>
            <div><div className="text-2xl font-semibold text-gray-900">{s.value}</div><div className="text-sm text-gray-500">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-border"><h2 className="font-semibold text-gray-900">Alle moskeeën</h2></div>
        <div className="divide-y divide-border">
          {tenants.map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0"
                style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>{t.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.city && `${t.city} · `}masjidconnect.be/{t.slug}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`badge ${statusColors[t.subscription_status]}`}>{statusLabels[t.subscription_status]}</span>
                <div className="text-xs text-gray-400 mt-1">€{t.subscription_price}/{t.subscription_interval === 'monthly' ? 'mnd' : 'jaar'}</div>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">Sinds {formatDate(t.created_at)}</div>
            </div>
          ))}
          {!tenants.length && (
            <div className="text-center py-12 text-gray-400"><Building2 size={32} className="mx-auto mb-2 text-gray-300"/><p className="text-sm">Nog geen moskeeën.</p></div>
          )}
        </div>
      </div>

      {showAddMoskee && <AddMoskeeModal onClose={() => setShowAddMoskee(false)} onCreated={() => { setShowAddMoskee(false); loadData() }} />}
      {showAddKlas && <AddKlasModal tenants={tenants} onClose={() => setShowAddKlas(false)} onCreated={() => { setShowAddKlas(false); loadData() }} />}
    </div>
  )
}

function AddMoskeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', city: '', email: '', subscription_price: '500', subscription_status: 'active', subscription_interval: 'yearly' })

  function handleName(name: string) {
    setForm(p => ({ ...p, name, slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') }))
  }

  async function handleCreate() {
    if (!form.name || !form.slug) return
    setLoading(true)
    try {
      const { data: tenant } = await supabase.from('tenants').insert({
        name: form.name.trim(), slug: form.slug.trim(), city: form.city || null, email: form.email || null,
        subscription_status: form.subscription_status, subscription_price: parseFloat(form.subscription_price),
        subscription_interval: form.subscription_interval, is_active: true,
      }).select().single()

      const year = new Date().getFullYear()
      await supabase.from('school_years').insert({
        tenant_id: tenant!.id, name: `${year}-${year+1}`,
        start_date: `${year}-09-01`, end_date: `${year+1}-06-30`, is_active: true,
      })
      onCreated()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-gray-900">Nieuwe moskee toevoegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="label">Naam *</label><input type="text" value={form.name} onChange={e => handleName(e.target.value)} placeholder="Moskee Al-Nour Antwerpen" className="input"/></div>
          <div><label className="label">URL slug *</label>
            <div className="flex items-center">
              <span className="px-3 py-2.5 bg-gray-100 border border-r-0 border-border rounded-l-xl text-sm text-gray-500">masjidconnect.be/</span>
              <input type="text" value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} className="input rounded-l-none" placeholder="al-nour-antwerpen"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Stad</label><input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Antwerpen" className="input"/></div>
            <div><label className="label">Prijs (€/jaar)</label><input type="number" value={form.subscription_price} onChange={e => setForm(p => ({ ...p, subscription_price: e.target.value }))} className="input"/></div>
          </div>
          <div><label className="label">Status</label>
            <select value={form.subscription_status} onChange={e => setForm(p => ({ ...p, subscription_status: e.target.value }))} className="input">
              <option value="active">Actief</option><option value="trial">Proefperiode</option><option value="inactive">Inactief</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={handleCreate} disabled={loading || !form.name || !form.slug} className="btn-primary flex-1 justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</> : 'Moskee toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddKlasModal({ tenants, onClose, onCreated }: { tenants: any[]; onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false)
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [form, setForm] = useState({ tenant_id: '', school_year_id: '', name: '', color: '#1B6B4A' })
  const colors = ['#1B6B4A','#1E3A5F','#B8861A','#7C3AED','#DC2626','#0891B2','#059669','#D97706']

  async function loadSchoolYears(tenantId: string) {
    const { data } = await supabase.from('school_years').select('*').eq('tenant_id', tenantId).order('start_date', { ascending: false })
    setSchoolYears(data ?? [])
    setForm(p => ({ ...p, tenant_id: tenantId, school_year_id: data?.[0]?.id ?? '' }))
  }

  async function handleCreate() {
    if (!form.name || !form.tenant_id || !form.school_year_id) return
    setLoading(true)
    try {
      await supabase.from('classes').insert({
        tenant_id: form.tenant_id, school_year_id: form.school_year_id,
        name: form.name.trim(), color: form.color,
      })
      onCreated()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-gray-900">Klas toevoegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="label">Moskee *</label>
            <select value={form.tenant_id} onChange={e => loadSchoolYears(e.target.value)} className="input">
              <option value="">Kies een moskee…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="label">Schooljaar *</label>
            <select value={form.school_year_id} onChange={e => setForm(p => ({ ...p, school_year_id: e.target.value }))} className="input" disabled={!form.tenant_id}>
              <option value="">Kies een schooljaar…</option>
              {schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.name}</option>)}
            </select>
          </div>
          <div><label className="label">Naam klas *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Groep 3A — Koran" className="input"/></div>
          <div><label className="label">Kleur</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map(c => <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }}/>)}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={handleCreate} disabled={loading || !form.name || !form.tenant_id || !form.school_year_id} className="btn-primary flex-1 justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</> : 'Klas aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}
