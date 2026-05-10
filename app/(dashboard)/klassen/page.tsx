'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, EmptyState } from '@/components/ui/PageShell'
import { GraduationCap, Users, BookOpen } from 'lucide-react'
import Link from 'next/link'

export default function KlassenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [classes, setClasses]   = useState<any[]>([])
  const [countMap, setCountMap] = useState<Record<string, number>>({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!profile) return
    loadClasses()
  }, [profile])

  async function loadClasses() {
    let data: any[] = []

    if (profile!.role === 'student') {
      const { data: d } = await supabase
        .from('class_students')
        .select('classes(*, school_years(name), groups(name))')
        .eq('student_id', profile!.id)
      data = d?.map((x: any) => x.classes).filter(Boolean) ?? []

    } else if (profile!.role === 'teacher') {
      const { data: d } = await supabase
        .from('class_teachers')
        .select('classes(*, school_years(name), groups(name))')
        .eq('teacher_id', profile!.id)
      data = d?.map((x: any) => x.classes).filter(Boolean) ?? []

    } else if (profile!.role === 'admin') {
      const { data: d, error: e } = await supabase
        .from('classes')
        .select('*, school_years(name), groups(name)')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_archived', false)
        .order('name')
      if (e) console.error('[klassen] admin query error:', e)
      data = d ?? []

    } else if (profile!.role === 'super_admin') {
      const { data: d, error: e } = await supabase
        .from('classes')
        .select('*, school_years(name), groups(name), tenants!classes_tenant_id_fkey(name)')
        .eq('is_archived', false)
        .order('name')
      if (e) console.error('[klassen] super_admin query error:', e)
      data = d ?? []
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
    }

    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const isSuperAdmin = profile?.role === 'super_admin'
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '')

  // Group classes by groep name; ungrouped classes go last
  const grouped = classes.reduce((acc, klas) => {
    const key = klas.groups?.name ?? ''
    if (!acc[key]) acc[key] = []
    acc[key].push(klas)
    return acc
  }, {} as Record<string, any[]>)

  const groupKeys = Object.keys(grouped).sort((a, b) => {
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

      {classes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={40}/>}
          title="Geen klassen gevonden"
          subtitle={isAdmin ? 'Maak uw eerste klas aan via Beheer.' : 'U bent nog niet aan een klas toegewezen.'}
        />
      ) : (
        <div className="space-y-8">
          {groupKeys.map(groupKey => (
            <div key={groupKey}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-semibold text-gray-800 text-base">
                  {groupKey || 'Zonder groep'}
                </h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {grouped[groupKey].length} {grouped[groupKey].length === 1 ? 'vak' : 'vakken'}
                </span>
                {/* School year — show once per group since all classes share the same year */}
                {grouped[groupKey][0]?.school_years?.name && (
                  <span className="text-xs text-gray-400">
                    · {grouped[groupKey][0].school_years.name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[groupKey].map((klas: any) => (
                  <Link key={klas.id} href={`/klassen/${klas.id}`} className="card-hover p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: klas.color ?? '#1B6B4A' }}>
                        {klas.name[0]}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isSuperAdmin && klas.tenants?.name && (
                          <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                            {klas.tenants.name}
                          </span>
                        )}
                      </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
