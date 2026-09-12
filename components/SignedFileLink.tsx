'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Loader2 } from 'lucide-react'

interface Props {
    bucket: 'submission-files' | 'module-documents' | 'student-documents' | 'tenant-documents'
    path: string
    className?: string
    children: React.ReactNode
}

function extractPath(value: string, bucket: string): string {
    // Legacy support: if stored value is a full public URL, extract just the path
    const marker = `/object/public/${bucket}/`
    const idx = value.indexOf(marker)
    return idx !== -1 ? value.slice(idx + marker.length) : value
}

export function SignedFileLink({ bucket, path, className, children }: Props) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // This used to be `const { data } = await …; if (data?.signedUrl) window.open(…)`
    // with no error branch and no pending state — so if the object was missing or
    // RLS denied it, clicking a document did absolutely nothing, forever, with no
    // explanation. Every dossier document, lesson module and student submission
    // in the app opens through this component.
    async function open(e: React.MouseEvent<HTMLAnchorElement>) {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        const storagePath = extractPath(path, bucket)
        const { data, error: signErr } = await supabase
            .storage.from(bucket).createSignedUrl(storagePath, 60)
        setBusy(false)

        if (signErr || !data?.signedUrl) {
            console.error(signErr)
            setError('Bestand kon niet worden geopend.')
            return
        }
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }

    return (
        <span className="inline-flex flex-col">
            <a href="#" onClick={open} className={className} aria-busy={busy}>
                {children}
                {busy && <Loader2 size={13} className="animate-spin inline ml-1.5 align-[-2px]" />}
            </a>
            {error && <span className="text-xs text-red-600 mt-0.5">{error}</span>}
        </span>
    )
}
