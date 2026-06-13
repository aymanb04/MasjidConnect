'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, FolderOpen, ChevronRight, Users } from 'lucide-react'

interface StudentRow {
  id: string
  first_name: string
  last_name: string
  email?: string
}

const STAFF_ROLES = ['admin', 'super_admin', 'teacher', 'leerlingenbegeleiding']

export default function DossiersPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    if (!profile) return
    if (!STAFF_ROLES.includes(profile.role)) { router.replace('/dashboard'); return }
    load()
  }, [profile])

  async function load() {
    if (profile!.role === 'teacher') {
      // Teachers: only students of their own classes
      const { data: teaching } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile!.id)
      const classIds = (teaching ?? []).map((t: any) => t.class_id)
      if (classIds.length === 0) { setLoading(false); return }

      const { data: links } = await supabase
        .from('class_students')
        .select('student_id')
        .in('class_id', classIds)
      const studentIds = Array.from(new Set((links ?? []).map((l: any) => l.student_id)))
      if (studentIds.length === 0) { setLoading(false); return }

      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', studentIds)
        .eq('is_active', true)
        .order('last_name')
      setStudents(data ?? [])
    } else {
      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('role', 'student')
        .eq('is_active', true)
        .order('last_name')
      if (profile!.role !== 'super_admin') {
        query = query.eq('tenant_id', profile!.tenant_id!)
      }
      const { data } = await query
      setStudents(data ?? [])
    }
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!profile || !STAFF_ROLES.includes(profile.role)) return null

  const filtered = search
    ? students.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : students

  return (
    <div className="animate-slide-up max-w-3xl">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title">Dossiers</h1>
          <p className="page-subtitle">
            {profile.role === 'teacher'
              ? 'Dossiers van jouw leerlingen'
              : 'Leerlingendossiers van de school'}
          </p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam…"
          className="input pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Users size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">
            {search ? 'Geen leerlingen gevonden.' : 'Geen leerlingen.'}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {filtered.map(s => (
            <Link
              key={s.id}
              href={`/dossiers/${s.id}`}
              className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {s.first_name?.[0]}{s.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {s.first_name} {s.last_name}
                </p>
                <p className="text-xs text-gray-400 truncate">{s.email}</p>
              </div>
              <FolderOpen size={15} className="text-gray-300 flex-shrink-0" />
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
