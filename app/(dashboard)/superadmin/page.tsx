'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { formatDate } from '@/lib/utils'
import { Building2, Users, TrendingUp, Shield, Plus, X, Loader2 } from 'lucide-react'

export default function SuperAdminPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [tenants, setTenants]     = useState<any[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)

  useEffect(() => {
    if (!profile || profile.role !== 'super_admin') return
    loadData()
  }, [profile])

  async function loadData() {
    const { data: t } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    const { count }   = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    setTenants(t ?? [])
    setTotalUsers(count ?? 0)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (profile?.role !== 'super_admin') {
    return <div className="card p-8 text-center text-gray-400">Geen toegang.</div>
  }

  const activeTenants  = tenants.filter(t => t.subscription_status === 'active')
  const monthlyRevenue = activeTenants.reduce((sum, t) =>
    sum + (t.subscription_interval === 'monthly' ? t.subscription_price : t.subscription_price / 12), 0)

  const statusColors: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    trial:     'bg-blue-100 text-blue-700',
    inactive:  'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  }
  const statusLabels: Record<string, string> = {
    active: 'Actief', trial: 'Proefperiode', inactive: 'Inactief', cancelled: 'Opgezegd'
  }

  return (
    <div className="animate-slide-up">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-primary-600"/> Super Admin
          </h1>
          <p className="page-subtitle">Overzicht van alle moskeeën op het platform</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16}/> Moskee toevoegen
        </button>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Moskeeën',       value: tenants.length,       icon: Building2,  color: 'bg-primary-50 text-primary-600' },
          { label: 'Actieve klanten', value: activeTenants.length, icon: TrendingUp, color: 'bg-green-50 text-green-600' },
          { label: 'Gebruikers',     value: totalUsers,            icon: Users,      color: 'bg-blue-50 text-blue-600' },
          { label: 'MRR',            value: `€${Math.round(monthlyRevenue)}`, icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.color}`}><s.icon size={20}/></div>
            <div>
              <div className="text-2xl font-semibold text-gray-900">{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tenant list */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-gray-900">Alle moskeeën</h2>
        </div>
        <div className="divide-y divide-border">
          {tenants.map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0"
                style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
                {t.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t.city && `${t.city} · `}masjidconnect.be/{t.slug}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`badge ${statusColors[t.subscription_status]}`}>
                  {statusLabels[t.subscription_status]}
                </span>
                <div className="text-xs text-gray-400 mt-1">
                  €{t.subscription_price}/{t.subscription_interval === 'monthly' ? 'mnd' : 'jaar'}
                </div>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                Sinds {formatDate(t.created_at)}
              </div>
            </div>
          ))}
          {!tenants.length && (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={32} className="mx-auto mb-2 text-gray-300"/>
              <p className="text-sm">Nog geen moskeeën geregistreerd.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddMoskeeModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); loadData() }}
        />
      )}
    </div>
  )
}

function AddMoskeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    name: '', slug: '', city: '', email: '',
    subscription_price: '500', subscription_status: 'active',
    subscription_interval: 'yearly',
    admin_first: '', admin_last: '', admin_email: '',
  })

  function handleName(name: string) {
    setForm(p => ({
      ...p, name,
      slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').replace(/-+/g, '-')
    }))
  }

  async function handleCreate() {
    if (!form.name || !form.slug) return
    setLoading(true)
    setError('')
    try {
      // 1. Moskee aanmaken
      const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({
        name: form.name.trim(),
        slug: form.slug.trim(),
        city: form.city || null,
        email: form.email || null,
        subscription_status: form.subscription_status,
        subscription_price: parseFloat(form.subscription_price),
        subscription_interval: form.subscription_interval,
        is_active: true,
      }).select().single()

      if (tenantErr) throw new Error(tenantErr.message)

      // 2. Schooljaar automatisch aanmaken
      const year = new Date().getFullYear()
      await supabase.from('school_years').insert({
        tenant_id: tenant!.id,
        name: `${year}-${year + 1}`,
        start_date: `${year}-09-01`,
        end_date: `${year + 1}-06-30`,
        is_active: true,
      })

      // 3. Admin account aanmaken als ingevuld
      if (form.admin_email) {
        const { error: adminErr } = await supabase.auth.signUp({
          email: form.admin_email.trim().toLowerCase(),
          password: crypto.randomUUID(),
          options: {
            data: {
              first_name: form.admin_first.trim() || 'Admin',
              last_name:  form.admin_last.trim()  || form.name,
              role:       'admin',
              tenant_id:  tenant!.id,
            }
          }
        })

        if (!adminErr) {
          await supabase.auth.resetPasswordForEmail(
            form.admin_email.trim().toLowerCase(),
            { redirectTo: `${window.location.origin}/login` }
          )
        }
      }

      onCreated()
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg my-8 animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-gray-900">Nieuwe moskee toevoegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Moskee info</p>
            <div className="space-y-3">
              <div>
                <label className="label">Naam *</label>
                <input type="text" value={form.name} onChange={e => handleName(e.target.value)}
                  placeholder="Moskee Al-Nour Antwerpen" className="input"/>
              </div>
              <div>
                <label className="label">URL slug *</label>
                <div className="flex items-center">
                  <span className="px-3 py-2.5 bg-gray-100 border border-r-0 border-border rounded-l-xl text-sm text-gray-500">
                    masjidconnect.be/
                  </span>
                  <input type="text" value={form.slug}
                    onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                    className="input rounded-l-none" placeholder="al-nour-antwerpen"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Stad</label>
                  <input type="text" value={form.city}
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="Antwerpen" className="input"/>
                </div>
                <div>
                  <label className="label">E-mail moskee</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="info@moskee.be" className="input"/>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Abonnement</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prijs (€/jaar)</label>
                <input type="number" value={form.subscription_price}
                  onChange={e => setForm(p => ({ ...p, subscription_price: e.target.value }))}
                  className="input"/>
              </div>
              <div>
                <label className="label">Status</label>
                <select value={form.subscription_status}
                  onChange={e => setForm(p => ({ ...p, subscription_status: e.target.value }))}
                  className="input">
                  <option value="active">Actief</option>
                  <option value="trial">Proefperiode</option>
                  <option value="inactive">Inactief</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Admin account <span className="text-gray-400 normal-case font-normal">(optioneel)</span>
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Voornaam</label>
                  <input type="text" value={form.admin_first}
                    onChange={e => setForm(p => ({ ...p, admin_first: e.target.value }))}
                    placeholder="Youssef" className="input"/>
                </div>
                <div>
                  <label className="label">Achternaam</label>
                  <input type="text" value={form.admin_last}
                    onChange={e => setForm(p => ({ ...p, admin_last: e.target.value }))}
                    placeholder="El-Mansouri" className="input"/>
                </div>
              </div>
              <div>
                <label className="label">E-mail admin</label>
                <input type="email" value={form.admin_email}
                  onChange={e => setForm(p => ({ ...p, admin_email: e.target.value }))}
                  placeholder="admin@moskee.be" className="input"/>
              </div>
              <p className="text-xs text-gray-400">
                De admin ontvangt een e-mail om zijn wachtwoord in te stellen.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={handleCreate} disabled={loading || !form.name || !form.slug}
            className="btn-primary flex-1 justify-center">
            {loading
              ? <><Loader2 size={15} className="animate-spin"/> Aanmaken…</>
              : 'Moskee toevoegen'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
