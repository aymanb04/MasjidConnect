'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getRoleBadge, formatDate } from '@/lib/utils'
import { Users, GraduationCap, Mail, Shield, Archive, ChevronDown, ChevronRight, X, Loader2, Search, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { InviteUserButton } from '@/components/features/admin/InviteUserButton'
import { CreateClassButton } from '@/components/features/admin/CreateClassButton'
import CsvImportButton from '@/components/features/admin/CsvImportButton'
import { DeleteUserButton } from '@/components/features/admin/DeleteUserButton'
import { ReactivateUserButton } from '@/components/features/admin/ReactivateUserButton'

export default function BeheerPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [users, setUsers]             = useState<any[]>([])
  const [classes, setClasses]         = useState<any[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  const [showArchived, setShowArchived]       = useState(false)
  const [archivedUsers, setArchivedUsers]     = useState<any[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [userSearch, setUserSearch]           = useState('')
  const [roleFilter, setRoleFilter]           = useState('all')

  const [expandedClass, setExpandedClass]     = useState<string | null>(null)
  const [classStudents, setClassStudents]     = useState<Record<string, any[]>>({})
  const [studentsLoading, setStudentsLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!profile) return
    if (!['admin', 'super_admin'].includes(profile.role)) {
      router.push('/dashboard')
      return
    }
    loadData()
  }, [profile])

  async function loadData() {
    const tid = profile!.tenant_id

    const [{ data: u }, { data: c }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('*').eq('tenant_id', tid).eq('is_active', true).order('last_name'),
      supabase.from('classes')
        .select('*, school_years(name), groups(name), class_students(id), class_teachers(profiles(first_name, last_name))')
        .eq('tenant_id', tid).eq('is_archived', false).order('name'),
      supabase.from('invitations').select('*').eq('tenant_id', tid).is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])

    setUsers(u ?? [])
    setClasses(c ?? [])
    setInvitations(inv ?? [])
    setLoading(false)
  }

  async function toggleArchived() {
    if (showArchived) { setShowArchived(false); return }
    setShowArchived(true)
    if (archivedUsers.length) return
    setArchivedLoading(true)
    const { data } = await supabase.from('profiles').select('*')
      .eq('tenant_id', profile!.tenant_id).eq('is_active', false).order('last_name')
    setArchivedUsers(data ?? [])
    setArchivedLoading(false)
  }

  async function toggleClass(classId: string) {
    if (expandedClass === classId) { setExpandedClass(null); return }
    setExpandedClass(classId)
    if (classStudents[classId]) return
    setStudentsLoading(prev => ({ ...prev, [classId]: true }))
    const { data } = await supabase
      .from('class_students')
      .select('profiles!class_students_student_id_fkey(id, first_name, last_name)')
      .eq('class_id', classId)
    setClassStudents(prev => ({ ...prev, [classId]: data?.map((d: any) => d.profiles).filter(Boolean) ?? [] }))
    setStudentsLoading(prev => ({ ...prev, [classId]: false }))
  }

  async function archiveClass(classId: string, name: string) {
    if (!window.confirm(`'${name}' archiveren? Leerlingen verliezen geen toegang tot ingediend werk.`)) return
    await supabase.from('classes').update({ is_archived: true }).eq('id', classId)
    if (expandedClass === classId) setExpandedClass(null)
    setClassStudents(prev => { const n = { ...prev }; delete n[classId]; return n })
    loadData()
  }

  async function removeStudentFromClass(classId: string, studentId: string) {
    await supabase.from('class_students').delete().eq('class_id', classId).eq('student_id', studentId)
    setClassStudents(prev => ({ ...prev, [classId]: (prev[classId] ?? []).filter((s: any) => s.id !== studentId) }))
    loadData()
  }

  if (profileLoading || loading) return <PageLoader />

  const teachers = users.filter(u => u.role === 'teacher')
  const students  = users.filter(u => u.role === 'student')
  const admins    = users.filter(u => u.role === 'admin')

  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (userSearch) {
      const q = userSearch.toLowerCase()
      return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    }
    return true
  })
  const filteredArchived = archivedUsers.filter(u => {
    if (!userSearch) return true
    const q = userSearch.toLowerCase()
    return `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">Beheer</h1>
          <p className="page-subtitle">Gebruikers, klassen en uitnodigingen beheren</p>
        </div>
        <Link href="/beheer/jaarovergang" className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 flex-shrink-0">
          <CalendarDays size={14}/> Jaarovergang
        </Link>
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
              <div key={klas.id} className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    onClick={() => toggleClass(klas.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {expandedClass === klas.id
                      ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0"/>
                      : <ChevronRight size={14} className="text-gray-400 flex-shrink-0"/>
                    }
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: klas.color }}>{klas.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800">{klas.name}</span>
                        {klas.groups?.name && (
                          <span className="text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {klas.groups.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {klas.class_students?.length ?? 0} leerlingen ·{' '}
                        {klas.class_teachers?.map((t: any) =>
                          `${t.profiles?.first_name} ${t.profiles?.last_name}`
                        ).join(', ') || 'Geen leerkracht'}
                      </div>
                    </div>
                  </button>
                  <span className="text-xs text-gray-400 flex-shrink-0">{klas.school_years?.name}</span>
                  <button
                    onClick={() => archiveClass(klas.id, klas.name)}
                    className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Archiveren"
                  >
                    <Archive size={14}/>
                  </button>
                </div>

                {expandedClass === klas.id && (
                  <div className="border-t border-border bg-gray-50/50 px-4 pb-3 pt-2">
                    {studentsLoading[klas.id] ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                        <Loader2 size={13} className="animate-spin"/> Laden…
                      </div>
                    ) : (classStudents[klas.id] ?? []).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Geen leerlingen ingeschreven.</p>
                    ) : (
                      <div className="space-y-0.5 mt-1">
                        {(classStudents[klas.id] ?? []).map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-colors group">
                            <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {s.first_name?.[0]}{s.last_name?.[0]}
                            </div>
                            <span className="text-sm text-gray-700 flex-1">{s.first_name} {s.last_name}</span>
                            <button
                              onClick={() => removeStudentFromClass(klas.id, s.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all"
                              title="Verwijder uit klas"
                            >
                              <X size={13}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!classes.length && (
              <p className="text-sm text-gray-400 text-center py-4">Nog geen klassen aangemaakt.</p>
            )}
          </div>
        </div>

        {/* Gebruikers */}
        <div className="card p-6">
          {/* Header: title + create actions only */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users size={17} className="text-primary-600"/> Gebruikers
            </h2>
            <div className="flex gap-2">
              <CsvImportButton tenantId={profile.tenant_id!} onImported={loadData}/>
              <InviteUserButton tenantId={profile.tenant_id!} onInvited={loadData}/>
            </div>
          </div>

          {/* Filter bar */}
          <div className="space-y-2 mb-3">
            <div className="flex gap-1 flex-wrap">
              {([
                { key: 'all',     label: 'Alle',        count: users.length    },
                { key: 'student', label: 'Leerlingen',  count: students.length },
                { key: 'teacher', label: 'Leerkrachten',count: teachers.length },
                { key: 'admin',   label: 'Admins',      count: admins.length   },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setRoleFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    roleFilter === tab.key
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}>
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${roleFilter === tab.key ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Zoek op naam of e-mail…" className="input pl-8 py-2 text-sm h-9"/>
              </div>
              <button onClick={toggleArchived}
                className={`text-xs px-2.5 rounded-lg border transition-colors flex-shrink-0 ${showArchived ? 'border-gray-300 bg-gray-100 text-gray-700' : 'border-border text-gray-400 hover:text-gray-600'}`}>
                Gearchiveerd
              </button>
            </div>
          </div>

          {/* Active user list */}
          <div className="space-y-1">
            {filteredUsers.length === 0 && !showArchived && (
              <p className="text-sm text-gray-400 text-center py-6">
                {userSearch ? 'Geen gebruikers gevonden.' : 'Nog geen gebruikers.'}
              </p>
            )}
            {filteredUsers.map((u: any) => {
              const rb = getRoleBadge(u.role)
              return (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
                    {u.first_name?.[0]}{u.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{u.first_name} {u.last_name}</div>
                    <div className="text-xs text-gray-400 truncate">{u.email}</div>
                  </div>
                  <span className={`badge flex-shrink-0 ${rb.color}`}>{rb.label}</span>
                  {u.id !== profile.id && (
                    <DeleteUserButton userId={u.id} name={`${u.first_name} ${u.last_name}`} onDeleted={loadData}/>
                  )}
                </div>
              )
            })}

            {/* Archived section */}
            {showArchived && (
              <>
                <div className="pt-3 pb-1 border-t border-border">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gearchiveerd</p>
                </div>
                {archivedLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                    <Loader2 size={13} className="animate-spin"/> Laden…
                  </div>
                ) : filteredArchived.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">
                    {userSearch ? 'Geen resultaten.' : 'Geen gearchiveerde gebruikers.'}
                  </p>
                ) : filteredArchived.map((u: any) => {
                  const rb = getRoleBadge(u.role)
                  return (
                    <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group opacity-60">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-gray-100 text-gray-400">
                        {u.first_name?.[0]}{u.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-600 truncate">{u.first_name} {u.last_name}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                      <span className={`badge flex-shrink-0 ${rb.color}`}>{rb.label}</span>
                      <ReactivateUserButton userId={u.id} name={`${u.first_name} ${u.last_name}`}
                        onReactivated={() => { setArchivedUsers(prev => prev.filter(a => a.id !== u.id)); loadData() }}/>
                    </div>
                  )
                })}
              </>
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
