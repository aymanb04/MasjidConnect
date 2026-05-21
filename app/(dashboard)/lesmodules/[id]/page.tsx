'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getFileIcon, formatFileSize } from '@/lib/utils'
import { ArrowLeft, BookOpen, FileText } from 'lucide-react'
import Link from 'next/link'
import ModuleDocumentUpload from '@/components/features/modules/ModuleDocumentUpload'
import { SignedFileLink } from '@/components/SignedFileLink'

export default function ModuleDetailPage() {
  const { id } = useParams()
  const { profile, loading: profileLoading } = useProfile()
  const [module, setModule] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile || !id) return
    loadData()
  }, [profile, id])

  async function loadData() {
    const supabase = getSupabase()
    const { data } = await supabase.from('lesson_modules').select('*, classes(name, color), module_documents(*), profiles!lesson_modules_created_by_fkey(first_name, last_name)').eq('id', id).single()
    setModule(data)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!module) return null

  const isTeacher = ['teacher','admin','super_admin'].includes(profile?.role ?? '')
  const docs = module.module_documents?.sort((a: any, b: any) => a.order_index - b.order_index) ?? []

  return (
    <div className="animate-slide-up max-w-3xl">
      <Link href="/lesmodules" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"><ArrowLeft size={15}/> Terug naar lesmodules</Link>

      <div className="card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0"><BookOpen size={22} className="text-primary-600"/></div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: module.classes?.color ?? '#1B6B4A' }}>{module.classes?.name}</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{module.title}</h1>
            {module.description && <p className="text-sm text-gray-500 mt-1">{module.description}</p>}
            <p className="text-xs text-gray-400 mt-2">Door {module.profiles?.first_name} {module.profiles?.last_name}</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Documenten ({docs.length})</h2>
          {isTeacher && <ModuleDocumentUpload moduleId={id as string} onUploaded={loadData} />}
        </div>
        {docs.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><FileText size={32} className="mx-auto mb-2 text-gray-300"/><p className="text-sm">Nog geen documenten.</p></div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <SignedFileLink key={doc.id} bucket="module-documents" path={doc.file_url} className="flex items-center gap-4 p-3.5 border border-border rounded-xl hover:border-primary-200 hover:bg-primary-50/30 transition-all group">
                <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">{getFileIcon(doc.file_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 transition-colors">{doc.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{doc.file_name}</span>
                    {doc.file_size && <><span className="text-xs text-gray-300">·</span><span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span></>}
                  </div>
                </div>
                <span className="text-xs text-primary-600 font-medium group-hover:underline flex-shrink-0">Openen →</span>
              </SignedFileLink>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
