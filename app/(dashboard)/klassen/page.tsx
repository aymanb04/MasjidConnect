'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, EmptyState } from '@/components/ui/PageShell'
import { GraduationCap, Users, BookOpen, Building2 } from 'lucide-react'
import Link from 'next/link'

export default function KlassenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const searchParams = useSearchParams()
  const [classes, setClasses]   = useState<any[]>([])
  const [countMap, setCountMap] = useState<Record<string, number>>({})
  const [loading, setLoading]   = useState(true)
  const [mosques, setMosques]   = useState<{ id: string; name: string }[]>([])
  const [mosqueFilter, setMosqueFilter] = useState<string>(searchParams?.get('mosque') ?? '')

  // School year filter state
  const [schoolYears, setSchoolYears] = useState<any[]>([])
  const [activeYearId, setActiveYearId] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<string>('')

  // Use a ref so loadClasses can read the latest yearFilter without stale closure issues
  const yearFilterRef = useRef(yearFilter)
  yearFilterRef.current = yearFilter

  useEffect(() => {
    if (!profile) return
    loadClasses(yearFilterRef.current)
  }, [profile, yearFilter])

  async function loadClasses(requestedYearId?: string) {
    setLoading(true)
    let data: any[] = []

    if (profile!.role === 'student') {
      // Students always see only the active year — no year filter tabs
      const { data: activeYear } = await supabase
        .from('school_years')
        .select('id')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_active', true)
        .maybeSingle()

      const { data: d } = await supabase
        .from('class_students')
        .select('classes(*, school_years(name), groups(name))')
        .eq('student_id', profile!.id)
      const all = d?.map((x: any) => x.classes).filter(Boolean) ?? []
      data = activeYear
        ? all.filter((c: any) => c.school_year_id === activeYear.id)
        : all

    } else if (profile!.role === 'teacher') {
      // Fetch school years first
      const { data: years } = await supabase
        .from('school_years')
        .select('*')
        .eq('tenant_id', profile!.tenant_id)
        .order('start_date', { ascending: false })
      const fetchedYears = years ?? []
      const active = fetchedYears.find((y: any) => y.is_active) ?? null
      setSchoolYears(fetchedYears)
      if (active && !activeYearId) {
        setActiveYearId(active.id)
        if (!yearFilter) setYearFilter(active.id)
      }

      const effectiveYearId = requestedYearId || active?.id || null

      const { data: d } = await supabase
        .from('class_teachers')
        .select('classes(*, school_years(name), groups(name))')
        .eq('teacher_id', profile!.id)
      const all = d?.map((x: any) => x.classes).filter(Boolean) ?? []
      data = effectiveYearId
        ? all.filter((c: any) => c.school_year_id === effectiveYearId)
        : all

    } else if (profile!.role === 'admin') {
      // Fetch school years first
      const { data: years } = await supabase
        .from('school_years')
        .select('*')
        .eq('tenant_id', profile!.tenant_id)
        .order('start_date', { ascending: false })
      const fetchedYears = years ?? []
      const active = fetchedYears.find((y: any) => y.is_active) ?? null
      setSchoolYears(fetchedYears)
      if (active && !activeYearId) {
        setActiveYearId(active.id)
        if (!yearFilter) {
          setYearFilter(active.id)
        }
      }

      const effectiveYearId = requestedYearId || active?.id || null
      const isActiveYear = !effectiveYearId || effectiveYearId === active?.id

      let query = supabase
        .from('classes')
        .select('*, school_years(name), groups(name)')
        .eq('tenant_id', profile!.tenant_id)
        .order('name')

      if (effectiveYearId) {
        query = query.eq('school_year_id', effectiveYearId)
      }
      // Only filter out archived classes when viewing the active year
      if (isActiveYear) {
        query = query.eq('is_archived', false)
      }

      const { data: d, error: e } = await query
      if (e) console.error('[klassen] admin query error:', e)
      data = d ?? []

    } else if (profile!.role === 'super_admin') {
      const { data: d, error: e } = await supabase
        .from('classes')
        .select('*, school_years(name), groups(name), tenants!classes_tenant_id_fkey(id, name)')
        .eq('is_archived', false)
        .order('name')
      if (e) console.error('[klassen] super_admin query error:', e)
      data = d ?? []

      // Build mosque list for filter dropdown
      const seen = new Set<string>()
      const uniqueMosques: { id: string; name: string }[] = []
      for (const c of data) {
        if (c.tenants?.id && !seen.has(c.tenants.id)) {
          seen.add(c.tenants.id)
          uniqueMosques.push({ id: c.tenants.id, name: c.tenants.name })
        }
      }
      setMosques(uniqueMosques.sort((a, b) => a.name.localeCompare(b.name, 'nl')))
    }

    setClasses(data)

    if (data.length > 0) {
      const { data: sc } = await supabase
        .from('class_students')
        .select('class_id')
        .in('class_id', data.map((c: any) => c.id))
      const map: Record<string, number> = {}
      sc?.forEach((s: any) => { map[s.class_id] = (map[s.class_id] ?? 0) + 1 })
      setCountMap(map)
    } else {
      setCountMap({})
    }

    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '')
  const showYearFilter = !isSuperAdmin && profile?.role !== 'student' && schoolYears.length > 0

  // Filter by mosque (super_admin only)
  const filteredClasses = isSuperAdmin && mosqueFilter
    ? classes.filter(c => c.tenant_id === mosqueFilter)
    : classes

  // Group: super_admin groups by tenantId+groupName, others by groupName
  const grouped = filteredClasses.reduce((acc, klas) => {
    const key = isSuperAdmin
      ? `${klas.tenant_id}|||${klas.groups?.name ?? ''}`
      : (klas.groups?.name ?? '')
    if (!acc[key]) acc[key] = []
    acc[key].push(klas)
    return acc
  }, {} as Record<string, any[]>)

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (isSuperAdmin) {
      const tenantA = grouped[a][0]?.tenants?.name ?? ''
      const tenantB = grouped[b][0]?.tenants?.name ?? ''
      const cmp = tenantA.localeCompare(tenantB, 'nl')
      if (cmp !== 0) return cmp
      const [, groupA] = a.split('|||')
      const [, groupB] = b.split('|||')
      if (groupA === '') return 1
      if (groupB === '') return -1
      return groupA.localeCompare(groupB, 'nl')
    }
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b, 'nl')
  })

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Klassen</h1>
        <p className="page-subtitle">
          {profile?.role === 'student'     ? 'Jouw ingeschreven klassen' :
           profile?.role === 'teacher'     ? 'Klassen waarvoor u lesgeeft' :
           profile?.role === 'super_admin' ? 'Alle klassen op het platform' :
           'Alle klassen in uw school'}
        </p>
      </div>

      {/* School year filter tabs — all roles except super_admin */}
      {showYearFilter && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {schoolYears.map((year: any) => {
            const isSelected = yearFilter === year.id
            return (
              <button
                key={year.id}
                onClick={() => setYearFilter(year.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-border hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                {year.name}
                {year.is_active && (
                  <span className={`ml-1.5 text-xs ${isSelected ? 'opacity-80' : 'text-primary-500'}`}>
                    • actief
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Mosque filter — super_admin only */}
      {isSuperAdmin && mosques.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <Building2 size={15} className="text-gray-400 flex-shrink-0"/>
          <select
            value={mosqueFilter}
            onChange={e => setMosqueFilter(e.target.value)}
            className="input max-w-xs text-sm"
          >
            <option value="">Alle moskeeën ({classes.length} klassen)</option>
            {mosques.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {filteredClasses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={40}/>}
          title="Geen klassen gevonden"
          subtitle={isAdmin ? 'Maak uw eerste klas aan via Beheer.' : 'U bent nog niet aan een klas toegewezen.'}
        />
      ) : (
        <div className="space-y-8">
          {groupKeys.map(groupKey => {
            const [, groupName] = isSuperAdmin ? groupKey.split('|||') : ['', groupKey]
            const mosqueName    = isSuperAdmin ? grouped[groupKey][0]?.tenants?.name : null
            const schoolYear    = !isSuperAdmin ? grouped[groupKey][0]?.school_years?.name : null

            return (
              <div key={groupKey}>
                <div className="flex items-center gap-3 mb-4">
                  {mosqueName && (
                    <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                      <Building2 size={10}/> {mosqueName}
                    </span>
                  )}
                  <h2 className="font-semibold text-gray-800 text-base">
                    {(isSuperAdmin ? groupName : groupKey) || 'Zonder groep'}
                  </h2>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {grouped[groupKey].length} {grouped[groupKey].length === 1 ? 'vak' : 'vakken'}
                  </span>
                  {schoolYear && (
                    <span className="text-xs text-gray-400">· {schoolYear}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[groupKey].map((klas: any) => (
                    <Link key={klas.id} href={`/klassen/${klas.id}`} className="card-hover p-5 flex flex-col gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: klas.color ?? '#1B6B4A' }}>
                        {klas.name[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{klas.name}</h3>
                        {klas.description && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{klas.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 pt-2 border-t border-border">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Users size={13}/><span>{countMap[klas.id] ?? 0} leerlingen</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <BookOpen size={13}/><span>Huiswerk</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
