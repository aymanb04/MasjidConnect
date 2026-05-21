'use client'

import { supabase } from '@/lib/supabase/singleton'

interface Props {
    bucket: 'submission-files' | 'module-documents'
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
    async function open(e: React.MouseEvent<HTMLAnchorElement>) {
        e.preventDefault()
        const storagePath = extractPath(path, bucket)
        const { data } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }

    return (
        <a href="#" onClick={open} className={className}>
            {children}
        </a>
    )
}
