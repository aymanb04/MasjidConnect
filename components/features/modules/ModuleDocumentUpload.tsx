'use client'

import { useState, useRef } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useRouter } from 'next/navigation'
import { Upload, X, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props { moduleId: string; onUploaded?: () => void }

export default function ModuleDocumentUpload({ moduleId, onUploaded }: Props) {
  const [open, setOpen]       = useState(false)
  const [file, setFile]       = useState<File | null>(null)
  const [title, setTitle]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router  = useRouter()
  const supabase = getSupabase()

  function handleFile(f: File | null) {
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { setError('Bestand te groot (max 20 MB)'); return }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''))
    setError('')
  }

  async function handleUpload() {
    if (!file || !title.trim()) return
    setLoading(true)
    setError('')
    try {
      const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const path = `modules/${moduleId}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('module-documents').upload(path, file)
      if (upErr) {
        setError(upErr.message ?? 'Upload mislukt.')
        setLoading(false)
        return
      }

      await supabase.from('module_documents').insert({
        module_id: moduleId,
        title: title.trim(),
        file_name: file.name,
        file_url: path,
        file_size: file.size,
        file_type: file.type,
      })

      setOpen(false)
      setFile(null)
      setTitle('')
      onUploaded?.(); router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Upload mislukt. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm py-1.5 px-3">
        <Plus size={14} /> Document toevoegen
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-semibold text-gray-900">Document toevoegen</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
                  dragging ? 'border-primary-400 bg-primary-50' : file ? 'border-green-300 bg-green-50' : 'border-border hover:border-primary-300 hover:bg-gray-50'
                )}
              >
                {file ? (
                  <div>
                    <div className="text-2xl mb-1">📄</div>
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={22} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 font-medium">Sleep een bestand of klik om te bladeren</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, Word, afbeeldingen — max 20 MB</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden" onChange={e => handleFile(e.target.files?.[0] ?? null)} />
              </div>

              {/* Titel */}
              <div>
                <label className="label">Naam document *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Bijv. Les 3 - Samenvatting Tajweed" className="input" />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 p-6 border-t border-border">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Annuleren</button>
              <button onClick={handleUpload} disabled={loading || !file || !title.trim()}
                className="btn-primary flex-1 justify-center">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Uploaden…</> : 'Uploaden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
