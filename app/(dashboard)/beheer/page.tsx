'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getRoleBadge, formatDate } from '@/lib/utils'
import {Users, GraduationCap, Mail, Shield} from 'lucide-react'
import { InviteUserButton } from '@/components/features/admin/InviteUserButton'
import { CreateClassButton } from '@/components/features/admin/CreateClassButton'
import CsvImportButton from '@/components/features/admin/CsvImportButton'
import { DeleteUserButton } from '@/components/features/admin/DeleteUserButton'

export default function BeheerPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [users, setUsers]             = useState<any[]>([])
  const [classes, setClasses]         = useState<any[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!profile) return
    if (!['admin', 'super_admin'].includes(profile.role)) return
    loadData()
  }, [profile])

  async function loadData() {
    const tid = profile!.tenant_id

    const [{ data: u }, { data: c }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('*').eq('tenant_id', tid).eq('is_active', true).order('last_name'),
      supabase.from('classes')
        .select('*, school_years(name), class_students(id), class_teachers(profiles(first_name, last_name))')
        .eq('tenant_id', tid).eq('is_archived', false).order('name'),
      supabase.from('invitations').select('*').eq('tenant_id', tid).is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])

    setUsers(u ?? [])
    setClasses(c ?? [])
    setInvitations(inv ?? [])
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return <div className="card p-8 text-center text-gray-400">Geen toegang.</div>
  }

  const teachers = users.filter(u => u.role === 'teacher')
  const students  = users.filter(u => u.role === 'student')

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Beheer</h1>
        <p className="page-subtitle">Gebruikers, klassen en uitnodigingen beheren</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Klassen',            value: classes.length,     icon: GraduationCap, color: 'bg-primary-50 text-primary-600' },
          { label: 'Leerkrachten',       value: teachers.length,    icon: Shield,        color: 'bg-blue-50 text-blue-600' },
          { label: 'Leerlingen',         value: students.length,    icon: Users,         color: 'bg-amber-50 text-amber-600' },
          { label: 'Open uitnodigingen', value: invitations.length, icon: Mail,          color: 'bg-purple-50 text-purple-600' },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Klassen */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap size={17} className="text-primary-600"/> Klassen
            </h2>
            <CreateClassButton tenantId={profile.tenant_id!} onCreated={loadData}/>
          </div>
          <div className="space-y-2">
            {classes.map((klas: any) => (
              <div key={klas.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: klas.color }}>{klas.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800">{klas.name}</div>
                  <div className="text-xs text-gray-400">
                    {klas.class_students?.length ?? 0} leerlingen ·{' '}
                    {klas.class_teachers?.map((t: any) =>
                      `${t.profiles?.first_name} ${t.profiles?.last_name}`
                    ).join(', ') || 'Geen leerkracht'}
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{klas.school_years?.name}</span>
              </div>
            ))}
            {!classes.length && (
              <p className="text-sm text-gray-400 text-center py-4">Nog geen klassen aangemaakt.</p>
            )}
          </div>
        </div>

        {/* Gebruikers */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users size={17} className="text-primary-600"/> Gebruikers
            </h2>
            <div className="flex gap-2">
              <CsvImportButton tenantId={profile.tenant_id!} classes={classes} onImported={loadData}/>
              <InviteUserButton tenantId={profile.tenant_id!} classes={classes} onInvited={loadData}/>
            </div>
          </div>
          <div className="space-y-1.5">
            {users.filter(u => u.role !== 'admin').map((u: any) => {
              const rb = getRoleBadge(u.role)
              return (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                         style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
                      {u.first_name?.[0]}{u.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{u.first_name} {u.last_name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                    <span className={`badge ${rb.color}`}>{rb.label}</span>
                    <DeleteUserButton userId={u.id} name={`${u.first_name} ${u.last_name}`} onDeleted={loadData}/>
                  </div>
              )
            })}
            {!users.filter(u => u.role !== 'admin').length && (
              <p className="text-sm text-gray-400 text-center py-4">Nog geen gebruikers.</p>
            )}
          </div>
        </div>

        {/* Openstaande uitnodigingen */}
        {invitations.length > 0 && (
          <div className="card p-6 lg:col-span-2">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Mail size={17} className="text-purple-600"/> Openstaande uitnodigingen
            </h2>
            <div className="space-y-2">
              {invitations.map((inv: any) => {
                const rb = getRoleBadge(inv.role)
                return (
                  <div key={inv.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-purple-100 bg-purple-50/50">
                    <Mail size={15} className="text-purple-500 flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{inv.email}</div>
                      <div className="text-xs text-gray-400">Verloopt {formatDate(inv.expires_at)}</div>
                    </div>
                    <span className={`badge ${rb.color}`}>{rb.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

