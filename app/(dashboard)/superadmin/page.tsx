'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { formatDate, getRoleBadge } from '@/lib/utils'
import { Building2, Users, TrendingUp, Shield, Plus, X, Loader2, ChevronDown, ChevronRight, GraduationCap, Pencil, MessageSquare, CheckCheck, Trash2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { InviteUserButton } from '@/components/features/admin/InviteUserButton'
import { DeleteUserButton } from '@/components/features/admin/DeleteUserButton'
import { ReactivateUserButton } from '@/components/features/admin/ReactivateUserButton'
import { useScrollLock } from '@/lib/hooks/useScrollLock'

export default function SuperAdminPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [tenants, setTenants]       = useState<any[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [classCount, setClassCount] = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [editingTenant, setEditingTenant] = useState<any>(null)
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  const [tenantUsers, setTenantUsers] = useState<Record<string, any[]>>({})
  const [usersLoading, setUsersLoading] = useState<Record<string, boolean>>({})
  const [showArchivedFor, setShowArchivedFor] = useState<Record<string, boolean>>({})
  const [archivedUsers, setArchivedUsers] = useState<Record<string, any[]>>({})
  const [archivedLoading, setArchivedLoading] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback]               = useState<any[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'super_admin') {
      router.push('/dashboard')
      return
    }
    loadData()
  }, [profile])

  async function loadData() {
    const [{ data: t }, { count }, { data: classRows }] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*', { count: 'estimated', head: true }),
      supabase.from('classes').select('tenant_id').eq('is_archived', false),
    ])
    const map: Record<string, number> = {}
    classRows?.forEach((c: any) => { map[c.tenant_id] = (map[c.tenant_id] ?? 0) + 1 })
    setTenants(t ?? [])
    setTotalUsers(count ?? 0)
    setClassCount(map)
    setLoading(false)
    loadFeedback()
  }

  async function loadFeedback() {
    setFeedbackLoading(true)
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    setFeedback(data ?? [])
    setFeedbackLoading(false)
  }

  async function markRead(id: string) {
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f))
    await supabase.from('feedback').update({ is_read: true }).eq('id', id)
  }

  async function deleteFeedback(id: string) {
    setFeedback(prev => prev.filter(f => f.id !== id))
    await supabase.from('feedback').delete().eq('id', id)
  }

  async function toggleTenant(tenantId: string) {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null)
      return
    }
    setExpandedTenant(tenantId)
    if (tenantUsers[tenantId]) return
    setUsersLoading(prev => ({ ...prev, [tenantId]: true }))
    const { data } = await supabase.from('profiles').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('last_name')
    setTenantUsers(prev => ({ ...prev, [tenantId]: data ?? [] }))
    setUsersLoading(prev => ({ ...prev, [tenantId]: false }))
  }

  function reloadTenantUsers(tenantId: string) {
    setTenantUsers(prev => { const next = { ...prev }; delete next[tenantId]; return next })
    setUsersLoading(prev => ({ ...prev, [tenantId]: true }))
    supabase.from('profiles').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('last_name')
      .then(({ data }) => {
        setTenantUsers(prev => ({ ...prev, [tenantId]: data ?? [] }))
        setUsersLoading(prev => ({ ...prev, [tenantId]: false }))
        loadData()
      })
  }

  async function toggleArchivedFor(tenantId: string) {
    const next = !showArchivedFor[tenantId]
    setShowArchivedFor(prev => ({ ...prev, [tenantId]: next }))
    if (!next || archivedUsers[tenantId]) return
    setArchivedLoading(prev => ({ ...prev, [tenantId]: true }))
    const { data } = await supabase.from('profiles').select('*')
      .eq('tenant_id', tenantId).eq('is_active', false).order('last_name')
    setArchivedUsers(prev => ({ ...prev, [tenantId]: data ?? [] }))
    setArchivedLoading(prev => ({ ...prev, [tenantId]: false }))
  }

  if (profileLoading || loading) return <PageLoader />

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
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-primary-600"/> Super Admin
          </h1>
          <p className="page-subtitle">Overzicht van alle moskeeën op het platform</p>
        </div>
        <div className="flex gap-2">
          <InviteUserButton onInvited={loadData}/>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={16}/> Moskee toevoegen
          </button>
        </div>
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
            <div key={t.id}>
              <div className="flex items-center">
              <button
                onClick={() => toggleTenant(t.id)}
                className="flex-1 flex items-center gap-4 px-6 py-4 hover:bg-gray-50/70 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0 overflow-hidden"
                  style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
                  {t.logo_url ? (
                    <img src={t.logo_url} alt="" className="w-full h-full object-cover rounded-xl"/>
                  ) : (
                    t.name[0]
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {t.city && `${t.city} · `}masjidconnect.be/{t.slug}
                    {t.website_url && ` · ${t.website_url}`}
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
                {expandedTenant === t.id
                  ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0"/>
                  : <ChevronRight size={15} className="text-gray-400 flex-shrink-0"/>
                }
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingTenant(t) }}
                className="px-3 py-4 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                title="Bewerken"
              >
                <Pencil size={14}/>
              </button>
              </div>

              {/* Expanded users */}
              {expandedTenant === t.id && (
                <div className="px-6 pb-4 bg-gray-50/50 border-t border-border">
                  <div className="flex items-center justify-between py-3 mb-2">
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Users size={14}/> Gebruikers
                    </span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleArchivedFor(t.id)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors ${showArchivedFor[t.id] ? 'border-gray-300 bg-gray-100 text-gray-700' : 'border-border text-gray-400 hover:text-gray-600'}`}>
                        Gearchiveerd
                      </button>
                      <Link href={`/klassen?mosque=${t.id}`}
                        className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium">
                        <GraduationCap size={13}/>
                        {classCount[t.id] ?? 0} klassen →
                      </Link>
                    </div>
                  </div>
                  {usersLoading[t.id] ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin"/> Laden…
                    </div>
                  ) : (tenantUsers[t.id] ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">Geen gebruikers gevonden.</p>
                  ) : (
                    <div className="space-y-1">
                      {(tenantUsers[t.id] ?? []).map((u: any) => {
                        const rb = getRoleBadge(u.role)
                        return (
                          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white transition-colors group border border-transparent hover:border-border">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                              style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
                              {u.first_name?.[0]}{u.last_name?.[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800">{u.first_name} {u.last_name}</div>
                              <div className="text-xs text-gray-400">{u.email}</div>
                            </div>
                            <span className={`badge ${rb.color}`}>{rb.label}</span>
                            <DeleteUserButton userId={u.id} name={`${u.first_name} ${u.last_name}`} onDeleted={() => reloadTenantUsers(t.id)}/>
                          </div>
                        )
                      })}

                      {showArchivedFor[t.id] && (
                        <>
                          <div className="pt-3 pb-1 border-t border-border">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gearchiveerd</p>
                          </div>
                          {archivedLoading[t.id] ? (
                            <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                              <Loader2 size={13} className="animate-spin"/> Laden…
                            </div>
                          ) : (archivedUsers[t.id] ?? []).length === 0 ? (
                            <p className="text-sm text-gray-400 py-2">Geen gearchiveerde gebruikers.</p>
                          ) : (archivedUsers[t.id] ?? []).map((u: any) => {
                            const rb = getRoleBadge(u.role)
                            return (
                              <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white transition-colors group border border-transparent hover:border-border opacity-60">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-gray-100 text-gray-400">
                                  {u.first_name?.[0]}{u.last_name?.[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-600">{u.first_name} {u.last_name}</div>
                                  <div className="text-xs text-gray-400">{u.email}</div>
                                </div>
                                <span className={`badge ${rb.color}`}>{rb.label}</span>
                                <ReactivateUserButton userId={u.id} name={`${u.first_name} ${u.last_name}`}
                                  onReactivated={() => {
                                    setArchivedUsers(prev => ({ ...prev, [t.id]: (prev[t.id] ?? []).filter(a => a.id !== u.id) }))
                                    reloadTenantUsers(t.id)
                                  }}/>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
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

      {/* ── Feedback inbox ── */}
      <div className="card overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-primary-600"/>
            <h2 className="font-semibold text-gray-900">Feedback inbox</h2>
            {feedback.filter(f => !f.is_read).length > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                {feedback.filter(f => !f.is_read).length} nieuw
              </span>
            )}
          </div>
          <button
            onClick={loadFeedback}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Vernieuwen
          </button>
        </div>

        {feedbackLoading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin"/> Laden…
          </div>
        ) : feedback.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-300">
            <MessageSquare size={28}/>
            <p className="text-sm">Nog geen feedback ontvangen.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {feedback.map((f: any) => {
              const typeConfig: Record<string, { label: string; emoji: string; color: string }> = {
                bug:       { label: 'Bug',       emoji: '🐛', color: 'bg-red-50 text-red-700 border-red-100' },
                suggestie: { label: 'Suggestie', emoji: '💡', color: 'bg-amber-50 text-amber-700 border-amber-100' },
                vraag:     { label: 'Vraag',     emoji: '❓', color: 'bg-blue-50 text-blue-700 border-blue-100' },
              }
              const tc = typeConfig[f.type] ?? typeConfig['vraag']
              const mins = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 60000)
              const relTime = mins < 60
                ? `${mins}m geleden`
                : mins < 1440
                  ? `${Math.floor(mins / 60)}u geleden`
                  : `${Math.floor(mins / 1440)}d geleden`

              return (
                <div
                  key={f.id}
                  className={`flex items-start gap-4 px-6 py-4 transition-colors ${
                    f.is_read ? 'bg-white' : 'bg-primary-50/30'
                  }`}
                >
                  {/* Type badge */}
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border flex-shrink-0 mt-0.5 ${tc.color}`}>
                    {tc.emoji} {tc.label}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${f.is_read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                      {f.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-gray-400">
                        {f.user_name ?? 'Onbekend'}
                        {f.user_role && ` · ${f.user_role}`}
                      </span>
                      {f.page_url && (
                        <span className="flex items-center gap-0.5 text-xs text-gray-400">
                          <ExternalLink size={10}/>
                          {f.page_url.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      )}
                      <span className="text-xs text-gray-300">{relTime}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!f.is_read && (
                      <button
                        onClick={() => markRead(f.id)}
                        title="Markeer als gelezen"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-colors"
                      >
                        <CheckCheck size={14}/>
                      </button>
                    )}
                    <button
                      onClick={() => deleteFeedback(f.id)}
                      title="Verwijderen"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddMoskeeModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); loadData() }}
        />
      )}
      {editingTenant && (
        <EditMoskeeModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSaved={() => { setEditingTenant(null); loadData() }}
        />
      )}
    </div>
  )
}

function AddMoskeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useScrollLock() // mounted = open
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    name: '', slug: '', city: '', email: '', logo_url: '', website_url: '',
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
      const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({
        name: form.name.trim(),
        slug: form.slug.trim(),
        city: form.city || null,
        email: form.email || null,
        logo_url: form.logo_url || null,
        website_url: form.website_url || null,
        subscription_status: form.subscription_status,
        subscription_price: parseFloat(form.subscription_price),
        subscription_interval: form.subscription_interval,
        is_active: true,
      }).select().single()

      if (tenantErr) {
        setError(tenantErr.message)
        setLoading(false)
        return
      }

      const year = new Date().getFullYear()
      await supabase.from('school_years').insert({
        tenant_id: tenant!.id,
        name: `${year}-${year + 1}`,
        start_date: `${year}-09-01`,
        end_date: `${year + 1}-06-30`,
        is_active: true,
      })

      if (form.admin_email) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            email:      form.admin_email.trim().toLowerCase(),
            first_name: form.admin_first.trim() || 'Admin',
            last_name:  form.admin_last.trim()  || form.name,
            role:       'admin',
            tenant_id:  tenant!.id,
          }),
        })
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Logo URL</label>
                  <input type="url" value={form.logo_url}
                    onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
                    placeholder="https://..." className="input"/>
                </div>
                <div>
                  <label className="label">Website</label>
                  <input type="url" value={form.website_url}
                    onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))}
                    placeholder="https://moskee.be" className="input"/>
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

function EditMoskeeModal({ tenant, onClose, onSaved }: { tenant: any; onClose: () => void; onSaved: () => void }) {
  useScrollLock() // mounted = open
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    name:                  tenant.name ?? '',
    logo_url:              tenant.logo_url ?? '',
    website_url:           tenant.website_url ?? '',
    city:                  tenant.city ?? '',
    email:                 tenant.email ?? '',
    subscription_status:   tenant.subscription_status ?? 'trial',
    subscription_price:    String(tenant.subscription_price ?? 500),
    subscription_interval: tenant.subscription_interval ?? 'yearly',
    notes:                 tenant.notes ?? '',
  })

  async function handleSave() {
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('tenants').update({
      name:                  form.name.trim(),
      logo_url:              form.logo_url.trim() || null,
      website_url:           form.website_url.trim() || null,
      city:                  form.city.trim() || null,
      email:                 form.email.trim() || null,
      subscription_status:   form.subscription_status,
      subscription_price:    parseFloat(form.subscription_price),
      subscription_interval: form.subscription_interval,
      notes:                 form.notes.trim() || null,
    }).eq('id', tenant.id)
    if (err) { setError(err.message); setLoading(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg my-8 animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold text-gray-900">{tenant.name} bewerken</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="label">Naam</label>
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Logo URL</label>
              <input type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
                placeholder="https://…/logo.png" className="input"/>
            </div>
            <div>
              <label className="label">Website</label>
              <input type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))}
                placeholder="https://moskee.be" className="input"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stad</label>
              <input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                placeholder="Antwerpen" className="input"/>
            </div>
            <div>
              <label className="label">E-mail moskee</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="info@moskee.be" className="input"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select value={form.subscription_status} onChange={e => setForm(p => ({ ...p, subscription_status: e.target.value }))} className="input">
                <option value="active">Actief</option>
                <option value="trial">Proefperiode</option>
                <option value="inactive">Inactief</option>
                <option value="cancelled">Opgezegd</option>
              </select>
            </div>
            <div>
              <label className="label">Prijs (€)</label>
              <input type="number" value={form.subscription_price}
                onChange={e => setForm(p => ({ ...p, subscription_price: e.target.value }))} className="input"/>
            </div>
          </div>
          <div>
            <label className="label">Notities</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="input resize-none h-16" placeholder="Interne notities…"/>
          </div>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={handleSave} disabled={loading || !form.name}
            className="btn-primary flex-1 justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin"/> Opslaan…</> : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
