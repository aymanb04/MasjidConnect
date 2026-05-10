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
        .select('classes(*, school_years(name))')
        .eq('student_id', profile!.id)
      data = d?.map((x: any) => x.classes).filter(Boolean) ?? []

    } else if (profile!.role === 'teacher') {
      const { data: d } = await supabase
        .from('class_teachers')
        .select('classes(*, school_years(name))')
        .eq('teacher_id', profile!.id)
      data = d?.map((x: any) => x.classes).filter(Boolean) ?? []

    } else if (profile!.role === 'admin') {
      const { data: d, error: e } = await supabase
        .from('classes')
        .select('*, school_years(name)')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_archived', false)
        .order('name')
      if (e) console.error('[klassen] admin query error:', e)
      data = d ?? []

    } else if (profile!.role === 'super_admin') {
      // FK hint needed: both classes and school_years have FKs to tenants
      const { data: d, error: e } = await supabase
        .from('classes')
        .select('*, school_years(name), tenants!classes_tenant_id_fkey(name)')
        .eq('is_archived', false)
        .order('name')
      if (e) console.error('[klassen] super_admin query error:', e)
      data = d ?? []
    }

    setClasses(data)

    // Laad leerlingenaantallen
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

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Klassen</h1>
        <p className="page-subtitle">
          {profile?.role === 'student'    ? 'Jouw ingeschreven klassen' :
           profile?.role === 'teacher'    ? 'Klassen waarvoor u lesgeeft' :
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((klas: any) => (
            <Link key={klas.id} href={`/klassen/${klas.id}`} className="card-hover p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: klas.color ?? '#1B6B4A' }}>
                  {klas.name[0]}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {klas.school_years?.name ?? '—'}
                  </span>
                  {/* Super admin ziet bij welke moskee de klas hoort */}
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
      )}
    </div>
  )
}
