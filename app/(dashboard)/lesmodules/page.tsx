'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader, EmptyState } from '@/components/ui/PageShell'
import { BookOpen, EyeOff } from 'lucide-react'
import Link from 'next/link'
import CreateModuleButton from '@/components/features/modules/CreateModuleButton'

export default function LesmodulesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [modules, setModules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadData()
  }, [profile])

  async function loadData() {
    const supabase = getSupabase()
    let data: any[] = []

    if (profile!.role === 'student') {
      const { data: enr } = await supabase.from('class_students').select('class_id').eq('student_id', profile!.id)
      const ids = enr?.map((e: any) => e.class_id) ?? []
      if (ids.length > 0) {
        const { data: m } = await supabase.from('lesson_modules').select('*, classes(name, color), module_documents(id)').in('class_id', ids).eq('is_visible', true).order('order_index')
        data = m ?? []
      }
    } else if (profile!.role === 'teacher') {
      const { data: t } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', profile!.id)
      const ids = t?.map((x: any) => x.class_id) ?? []
      if (ids.length > 0) {
        const { data: m } = await supabase.from('lesson_modules').select('*, classes(name, color), module_documents(id)').in('class_id', ids).order('order_index')
        data = m ?? []
      }
    } else {
      const { data: m } = await supabase.from('lesson_modules').select('*, classes(name, color), module_documents(id)').order('created_at', { ascending: false })
      data = m ?? []
    }

    setModules(data)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const isTeacher = ['teacher','admin','super_admin'].includes(profile?.role ?? '')

  const byClass: Record<string, { name: string; color: string; items: any[] }> = {}
  modules.forEach(m => {
    if (!byClass[m.class_id]) byClass[m.class_id] = { name: m.classes?.name ?? '—', color: m.classes?.color ?? '#1B6B4A', items: [] }
    byClass[m.class_id].items.push(m)
  })

  return (
    <div className="animate-slide-up">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Lesmodules</h1>
          <p className="page-subtitle">{modules.length} module{modules.length !== 1 ? 's' : ''} beschikbaar</p>
        </div>
        {isTeacher && <CreateModuleButton />}
      </div>

      {modules.length === 0 ? (
        <EmptyState icon={<BookOpen size={40}/>} title="Geen lesmodules gevonden" subtitle={isTeacher ? 'Maak uw eerste lesmodule aan.' : 'Uw leerkracht heeft nog geen modules gedeeld.'} />
      ) : (
        <div className="space-y-6">
          {Object.entries(byClass).map(([classId, group]) => (
            <div key={classId} className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-2.5" style={{ borderLeftWidth: '3px', borderLeftColor: group.color }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: group.color }}>{group.name[0]}</div>
                <span className="font-semibold text-gray-800 text-sm">{group.name}</span>
              </div>
              <div className="divide-y divide-border">
                {group.items.map((m: any) => (
                  <Link key={m.id} href={`/lesmodules/${m.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors group">
                    <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0"><BookOpen size={17} className="text-primary-600"/></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 transition-colors">{m.title}</div>
                      {m.description && <div className="text-xs text-gray-400 mt-0.5 truncate">{m.description}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400">{m.module_documents?.length ?? 0} bestanden</span>
                      {isTeacher && !m.is_visible && <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><EyeOff size={11}/> Verborgen</span>}
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
